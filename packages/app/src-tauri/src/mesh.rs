// Bytes between the owner's devices over a mesh VPN (editor spec §40, mesh_vpn_sync; encrypted_everywhere).
// - Rust only carries bytes. Every message is sealed in the sync package before it gets here, so this code never holds
//   a key and never sees a note. The window's connect policy stays closed: the page cannot open a socket itself.
// - Only private addresses. A device listens on, dials, and accepts from addresses a mesh VPN or the home network
//   gives it: loopback, 10/8, 172.16/12, 192.168/16, 100.64/10 (Tailscale and CGNAT), and fc00::/7 (Tailscale v6).
//   A public address, the "any address" 0.0.0.0, and a name that is not an address are all refused.
// - Whole messages, each after its length (4 bytes, big end first), and no longer than `MOST_BYTES`. A longer one
//   closes the connection.
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, TcpListener, TcpStream};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

/// The longest message, in bytes: 16 MiB.
pub const MOST_BYTES: usize = 16 * 1024 * 1024;
/// The words said when an address is not a private one.
pub const REFUSED: &str =
    "Only addresses on the home network or the mesh VPN may be used, so nothing was opened.";

/// Whether `ip` is an address of the home network or a mesh VPN.
pub fn private_ip(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(a) => private_v4(a),
        IpAddr::V6(a) => private_v6(a),
    }
}

fn private_v4(a: &Ipv4Addr) -> bool {
    let o = a.octets();
    !a.is_unspecified()
        && (a.is_loopback()
            || o[0] == 10
            || (o[0] == 172 && (16..=31).contains(&o[1]))
            || (o[0] == 192 && o[1] == 168)
            || (o[0] == 100 && (64..=127).contains(&o[1])))
}

fn private_v6(a: &Ipv6Addr) -> bool {
    if let Some(v4) = a.to_ipv4_mapped() {
        return private_v4(&v4);
    }
    !a.is_unspecified() && (a.is_loopback() || (a.segments()[0] & 0xfe00) == 0xfc00)
}

/// The address in `text` (`host:port`, an address and never a name), when it is a private one.
pub fn checked(text: &str) -> Result<SocketAddr, String> {
    let addr: SocketAddr = text
        .parse()
        .map_err(|_| "That is not an address and a port.".to_string())?;
    if private_ip(&addr.ip()) {
        Ok(addr)
    } else {
        Err(REFUSED.to_string())
    }
}

/// One open connection: the half that writes, and the messages the reading thread has taken in.
struct Conn {
    out: TcpStream,
    inbox: Arc<Mutex<Receiver<Option<Vec<u8>>>>>,
}

/// The listeners and connections the window holds, by number.
#[derive(Default)]
pub struct Mesh {
    next: Mutex<u32>,
    listeners: Mutex<HashMap<u32, TcpListener>>,
    conns: Mutex<HashMap<u32, Conn>>,
}

fn read_frame(s: &mut TcpStream) -> Option<Vec<u8>> {
    let mut head = [0u8; 4];
    s.read_exact(&mut head).ok()?;
    let n = u32::from_be_bytes(head) as usize;
    if n > MOST_BYTES {
        return None;
    }
    let mut body = vec![0u8; n];
    s.read_exact(&mut body).ok()?;
    Some(body)
}

impl Mesh {
    fn number(&self) -> u32 {
        let mut n = self.next.lock().unwrap();
        *n += 1;
        *n
    }

    /// Listens on the private address `text`. Returns the listener's number and the address it holds.
    pub fn listen(&self, text: &str) -> Result<(u32, String), String> {
        let l = TcpListener::bind(checked(text)?).map_err(|e| e.to_string())?;
        let held = l.local_addr().map_err(|e| e.to_string())?.to_string();
        let id = self.number();
        self.listeners.lock().unwrap().insert(id, l);
        Ok((id, held))
    }

    /// Waits for one device to reach listener `id`. A device from an address that is not private is closed at once.
    pub fn accept(&self, id: u32) -> Result<u32, String> {
        let l = self
            .listeners
            .lock()
            .unwrap()
            .get(&id)
            .ok_or("No such listener.")?
            .try_clone()
            .map_err(|e| e.to_string())?;
        loop {
            let (s, from) = l.accept().map_err(|e| e.to_string())?;
            if private_ip(&from.ip()) {
                return self.adopt(s);
            }
        }
    }

    /// Dials the private address `text`, waiting at most `secs` seconds.
    pub fn dial(&self, text: &str, secs: u64) -> Result<u32, String> {
        let s = TcpStream::connect_timeout(&checked(text)?, Duration::from_secs(secs.clamp(1, 60)))
            .map_err(|e| e.to_string())?;
        self.adopt(s)
    }

    fn adopt(&self, s: TcpStream) -> Result<u32, String> {
        let mut reader = s.try_clone().map_err(|e| e.to_string())?;
        let (tx, rx) = channel();
        thread::spawn(move || {
            while let Some(m) = read_frame(&mut reader) {
                if tx.send(Some(m)).is_err() {
                    return;
                }
            }
            let _ = tx.send(None); // closed, or a message too long
        });
        let id = self.number();
        self.conns.lock().unwrap().insert(
            id,
            Conn {
                out: s,
                inbox: Arc::new(Mutex::new(rx)),
            },
        );
        Ok(id)
    }

    /// Sends `message` whole on connection `id`.
    pub fn send(&self, id: u32, message: &[u8]) -> Result<(), String> {
        if message.len() > MOST_BYTES {
            return Err("That message is too long.".to_string());
        }
        let mut conns = self.conns.lock().unwrap();
        let c = conns.get_mut(&id).ok_or("No such connection.")?;
        let mut framed = (message.len() as u32).to_be_bytes().to_vec();
        framed.extend_from_slice(message);
        c.out.write_all(&framed).map_err(|e| e.to_string())
    }

    /// The next message on connection `id`, waiting at most `ms`: `Ok(None)` when none came, `Err` once it is closed.
    pub fn receive(&self, id: u32, ms: u64) -> Result<Option<Vec<u8>>, String> {
        let inbox = self
            .conns
            .lock()
            .unwrap()
            .get(&id)
            .ok_or("No such connection.")?
            .inbox
            .clone();
        // the table is free while this waits, so a send is never held up by it
        let inbox = inbox.lock().unwrap();
        match inbox.recv_timeout(Duration::from_millis(ms.min(500))) {
            Ok(Some(m)) => Ok(Some(m)),
            Ok(None) | Err(RecvTimeoutError::Disconnected) => Err("closed".to_string()),
            Err(RecvTimeoutError::Timeout) => Ok(None),
        }
    }

    /// Closes connection or listener `id`.
    pub fn close(&self, id: u32) {
        self.listeners.lock().unwrap().remove(&id);
        if let Some(c) = self.conns.lock().unwrap().remove(&id) {
            let _ = c.out.shutdown(std::net::Shutdown::Both);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_private_addresses_are_used() {
        for ok in [
            "127.0.0.1:1",
            "10.1.2.3:1",
            "172.16.0.1:1",
            "172.31.255.1:1",
            "192.168.1.5:1",
            "100.64.0.1:1",
            "100.127.1.1:1",
            "[::1]:1",
            "[fd7a:115c:a1e0::1]:1",
            "[::ffff:10.0.0.1]:1",
        ] {
            assert!(checked(ok).is_ok(), "{ok}");
        }
        for no in [
            "0.0.0.0:1",
            "8.8.8.8:1",
            "172.32.0.1:1",
            "100.128.0.1:1",
            "100.63.0.1:1",
            "169.254.1.1:1",
            "[::]:1",
            "[2001:db8::1]:1",
            "[::ffff:8.8.8.8]:1",
            "example.com:1",
            "10.0.0.1",
            "",
        ] {
            assert!(checked(no).is_err(), "{no}");
        }
    }

    #[test]
    fn whole_messages_travel_both_ways_and_a_public_address_is_never_opened() {
        let m = Mesh::default();
        let (l, held) = m.listen("127.0.0.1:0").unwrap();
        let other = Mesh::default();
        let a = other.dial(&held, 5).unwrap();
        let b = m.accept(l).unwrap();
        other.send(a, b"hello").unwrap();
        let big = vec![7u8; 100_000];
        other.send(a, &big).unwrap();
        assert_eq!(m.receive(b, 500).unwrap().unwrap(), b"hello");
        assert_eq!(m.receive(b, 500).unwrap().unwrap(), big);
        assert_eq!(m.receive(b, 50).unwrap(), None);
        m.send(b, b"back").unwrap();
        assert_eq!(other.receive(a, 500).unwrap().unwrap(), b"back");
        other.close(a);
        let mut gone = false;
        for _ in 0..10 {
            if m.receive(b, 100).is_err() {
                gone = true;
                break;
            }
        }
        assert!(gone, "the close is seen");
        assert!(m.dial("8.8.8.8:80", 1).is_err());
        assert!(m.listen("0.0.0.0:0").is_err());
    }

    #[test]
    fn a_message_that_is_too_long_ends_the_connection() {
        let m = Mesh::default();
        let (l, held) = m.listen("127.0.0.1:0").unwrap();
        let mut raw = TcpStream::connect(&held).unwrap();
        let b = m.accept(l).unwrap();
        raw.write_all(&((MOST_BYTES as u32) + 1).to_be_bytes())
            .unwrap();
        let mut closed = false;
        for _ in 0..10 {
            if m.receive(b, 100).is_err() {
                closed = true;
                break;
            }
        }
        assert!(closed);
        assert!(m.send(b, &vec![0u8; MOST_BYTES + 1]).is_err());
    }
}
