// What this machine has that sharing could use (editor spec ES§40, five_layer_stack). Rust only looks and reports: it
// changes nothing and opens nothing. The person decides in the window, one offer at a time.
// - A mesh VPN: the machine asks its own system which address would reach a Tailscale peer, and keeps that address only
//   when it is one the VPN gave (100.64/10). Nothing is sent: a UDP connect only picks a route.
use std::net::{IpAddr, SocketAddr, UdpSocket};

/// The address Tailscale answers on for every machine in a tailnet. It is only used to pick a route.
const FAR: &str = "100.100.100.100:9";

/// Whether `ip` is one a mesh VPN gives its machines (100.64.0.0/10).
pub fn mesh_vpn(ip: &IpAddr) -> bool {
    match ip {
        IpAddr::V4(a) => a.octets()[0] == 100 && (64..=127).contains(&a.octets()[1]),
        IpAddr::V6(_) => false,
    }
}

/// The address this machine would use to reach `far`, when the system has a route. Nothing is sent.
fn local_toward(far: SocketAddr) -> Option<IpAddr> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect(far).ok()?;
    Some(socket.local_addr().ok()?.ip())
}

/// The offers for `local`: the mesh VPN's address of this machine, or none.
pub fn vpns_from(local: Option<IpAddr>) -> Vec<(String, String)> {
    match local {
        Some(ip) if mesh_vpn(&ip) => vec![("the mesh VPN".to_string(), ip.to_string())],
        _ => Vec::new(),
    }
}

/// The mesh VPN addresses of this machine, each with the name to say it by.
pub fn vpns() -> Vec<(String, String)> {
    vpns_from(FAR.parse().ok().and_then(local_toward))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ip(s: &str) -> IpAddr {
        s.parse().unwrap()
    }

    #[test]
    fn a_mesh_vpn_address_is_one_in_the_vpn_range() {
        assert!(mesh_vpn(&ip("100.64.0.2")));
        assert!(mesh_vpn(&ip("100.127.255.254")));
        assert!(!mesh_vpn(&ip("100.63.0.1")));
        assert!(!mesh_vpn(&ip("100.128.0.1")));
        assert!(!mesh_vpn(&ip("192.168.1.5")));
        assert!(!mesh_vpn(&ip("fd7a:115c:a1e0::1")));
    }

    #[test]
    fn only_a_vpn_address_is_offered() {
        assert_eq!(
            vpns_from(Some(ip("100.64.0.2"))),
            vec![("the mesh VPN".to_string(), "100.64.0.2".to_string())]
        );
        assert!(vpns_from(Some(ip("192.168.1.5"))).is_empty());
        assert!(vpns_from(None).is_empty());
    }
}
