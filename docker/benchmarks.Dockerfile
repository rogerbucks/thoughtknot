# The image the instruction-count benchmarks run in on a developer's own machine (spec §12, quality_ratchet): Linux,
# Node 24 and Valgrind, so Cachegrind counts where macOS cannot (it does not run on Apple-silicon Macs). For counts
# before and after a change on one machine; never compared with the baseline CI counts on x86-64, as on a Mac this is
# ARM Linux, whose instructions are not CI's. The repository is mounted, never copied in, and node_modules is the
# container's own volume, so the host's is never touched: scripts/bench-local.mjs (npm run bench:local) builds and runs it.
#
# node:24.20.0-trixie-slim, pinned by its digest on 2026-10-12. The digest's own images were created by
# 2026-08-27T17:10:35Z (the latest of its platforms, read with `docker buildx imagetools inspect <image@digest>`), over
# 7 days before it was pinned.
FROM node:24.22.1-trixie-slim@sha256:89c5244bc22a9bc3287d89ebc7e49b9cb5bb84cd40e6175ac3421d5a9f68b95a

# Valgrind, GPL-3.0, a tool run here alone and never shipped (licences/bundled.json, ciOnlyTools), at trixie's version
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends valgrind=1:3.24.0-3 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /repo
