# Terminal connection demo

This runbook demonstrates one tmux session through:

- a local tmux client;
- direct SSH and Maximal's SSH connector;
- browser SSH through Google Cloud for a Compute Engine-hosted session; and
- a browser URL through pico.sh `tuns` or an SSH tunnel.

The demo MUST use a disposable account or host that contains no production
credentials. A writable shared terminal gives every participant the authority
of the account running tmux.

## Prerequisites

The host MUST provide `tmux` and an OpenSSH server. Each participant MUST use a
dedicated SSH key authorized for the disposable account.

The browser variants MUST provide
[`ttyd`](https://github.com/tsl0922/ttyd). The Google Cloud browser variant
MUST use a Compute Engine VM and Google Cloud IAM. Each participant MUST have
their own authorized identity.

`pipe.sh`, [`pipe.pico.sh`](https://pico.sh/pipe), and
[`pipa.sh`](https://pipa.sh/) MUST NOT be treated as interchangeable:
`pipe.pico.sh` is a pub/sub byte-stream service, while `pipa.sh` advertises an
SSH reverse-relay service. The exact `pipe.sh` domain was not verified as an SSH
relay. pico.sh's [`tuns`](https://pico.sh/tuns) service is a separate SSH
reverse tunnel that can expose a localhost web terminal over HTTPS.

Google's commonly used `stun.l.google.com:19302` is a STUN service for WebRTC
address discovery, not a general-purpose traffic relay. WebRTC applications
that cannot establish a direct peer connection need a TURN service. Neither
STUN nor TURN provides the terminal-sharing UI or signaling by itself.

Set a session name on the host:

```sh
session=maximal-connection-demo
tmux new-session -d -s "$session"
tmux set-option -t "$session" remain-on-exit on
tmux send-keys -t "$session" \
  'printf "session=%s host=%s nonce=%s\n" "$TMUX" "$(hostname)" "$(openssl rand -hex 8)"' \
  Enter
```

Every connection path MUST attach to `maximal-connection-demo`. A participant
MUST verify the printed host and obtain a fresh nonce before the path counts as
demonstrated.

## Local tmux

Attach a second local client:

```sh
tmux attach-session -t maximal-connection-demo
```

Run this inside the session:

```sh
printf 'local nonce=%s\n' "$(openssl rand -hex 8)"
```

Detach with `Ctrl-b d`. The session MUST remain present in:

```sh
tmux list-sessions -F '#{session_name}'
```

## Direct SSH

Add a simple host alias to the participant's `~/.ssh/config`:

```sshconfig
Host maximal-direct-demo
    HostName demo.example.test
    User terminal-demo
    IdentityFile ~/.ssh/maximal-terminal-demo
    IdentitiesOnly yes
```

Replace `demo.example.test`, `terminal-demo`, and the identity path with the
disposable host values. OpenSSH host-key verification MUST remain enabled.

Attach from a terminal:

```sh
ssh -t maximal-direct-demo \
  tmux new-session -A -s maximal-connection-demo
```

Maximal discovers the same single-pattern `Host` alias. In Maximal, select
**Terminal**, select **SSH**, and select `maximal-direct-demo`. To exercise the
remote-tmux connector, select the running `maximal-direct-demo — Terminal 1`
target after the session exists.

The direct SSH launch and the remote-tmux launch MUST each print a fresh nonce.
A command typed through either client MUST be visible in every attached client.

## SSH through pico.sh tuns

Use tuns as a reverse TCP relay when the tmux host is behind NAT or is not
directly reachable. On the host, publish its SSH daemon through an outbound
tuns connection:

```sh
ssh -R maximal-demo:22:localhost:22 tuns.sh
```

Keep this connection running. The host MUST permit SSH only for authorized
accounts and keys, and SSH host-key verification MUST remain enabled.

From the participant's machine, connect through the tuns jump host and attach
to the existing session:

```sh
ssh -t -J tuns.sh terminal-demo@PICO_USERNAME-maximal-demo \
  tmux new-session -A -s maximal-connection-demo
```

Replace `terminal-demo` and `PICO_USERNAME` with the host login and pico.sh
account name. OpenSSH authenticates the relay hop and then authenticates the
host login independently; the participant MUST verify the target host key on
first connection through a trusted channel.

For Maximal, add the same destination as a simple SSH config alias:

```sshconfig
Host maximal-tuns-demo
    HostName PICO_USERNAME-maximal-demo
    User terminal-demo
    ProxyJump tuns.sh
    IdentityFile ~/.ssh/maximal-terminal-demo
    IdentitiesOnly yes
```

Maximal can discover and launch `maximal-tuns-demo` using its existing SSH
connector. The participant's key for the target host MUST be authorized
separately from any pico.sh account authentication. The published TCP port is
an SSH entry point, not a browser URL; use the browser URL through `ttyd` and
tuns below when browser access is required.

## Browser URL through SSH

The host MUST bind the web terminal only to loopback:

```sh
ttyd \
  --interface 127.0.0.1 \
  --port 7681 \
  --credential 'terminal-demo:REPLACE_WITH_A_RANDOM_PASSWORD' \
  --check-origin \
  --max-clients 2 \
  tmux new-session -A -s maximal-connection-demo
```

The participant MUST create an SSH local forward using the direct SSH alias:

```sh
ssh -N -L 7681:127.0.0.1:7681 maximal-direct-demo
```

Then open <http://127.0.0.1:7681/> in the participant's browser.

The URL MUST remain loopback-only. The SSH connection supplies transport
encryption, host verification, and participant authentication. This ttyd
configuration is read-only; add `--writable` only for a disposable account when
participants must be able to type. A writable shared terminal grants shell
access as the account running tmux.

## Browser URL through pico.sh tuns

This is the direct path for demonstrating a browser terminal behind a
shareable HTTPS URL. On the tmux host, start `ttyd` bound only to loopback. The
example requires HTTP Basic Authentication and leaves ttyd read-only:

```sh
ttyd \
  --interface 127.0.0.1 \
  --port 7681 \
  --credential 'terminal-demo:REPLACE_WITH_A_RANDOM_PASSWORD' \
  --check-origin \
  --max-clients 2 \
  tmux new-session -A -s maximal-connection-demo
```

In another host terminal, open a tuns HTTP tunnel:

```sh
ssh -R terminal-demo:80:localhost:7681 tuns.sh
```

The tunnel output and pico.sh account name identify the corresponding
`https://{username}-terminal-demo.tuns.sh` URL. Give the URL and Basic Auth
password to intended viewers through separate channels. Do not put the password
in the URL. For an interactive session, add `--writable` to `ttyd` only when
using a disposable account and only for specifically authorized viewers.

The tuns documentation lists private sharing, but this runbook does not assume
an undocumented access-control command. If the account's current tuns
configuration supports private sharing, enable it and verify from an
unauthorized browser that access is denied before relying on it. Otherwise,
Basic Auth is required and the URL MUST be treated as public. Stop the SSH
tunnel and ttyd when finished.

This provides a browser URL, not end-to-end secrecy from the tunnel provider:
the HTTPS endpoint is served through tuns infrastructure. Use a disposable
account with no production credentials. For sensitive terminal output, prefer
direct SSH/IAP or a browser-sharing service with a verified end-to-end
encryption model.

## Browser-based collaborative terminal tools

[`sshx`](https://github.com/ekzhang/sshx) is an example of the
browser-first, collaborative-terminal experience (shareable URL, multiple
participants, and a collaborative canvas). Its project documents end-to-end
encryption and says self-hosted deployments are not supported. Treat its
generated URL as a bearer capability, share it only with intended participants,
and review the current project's security claims before using it with sensitive
shells. Start sshx on the host and use its terminal to attach to
`maximal-connection-demo`.

`pipe.pico.sh` has an HTTP/WebSocket interface in addition to its SSH CLI, but
the documented browser interface requires public topics and is unauthenticated.
It is suitable for experiments with non-sensitive streams, not as the secure
browser terminal for this demo.

## Google Cloud browser SSH

Google Cloud's
[SSH-in-browser](https://docs.cloud.google.com/compute/docs/connect/ssh-in-browser)
is a supported browser terminal for a Compute Engine VM; it is not a general
public relay endpoint. Each participant MUST authenticate to their own Google
identity and MUST be granted the required Compute Engine and, when used, IAP
permissions. The session MUST NOT rely on sharing a browser URL as a bearer
credential.

On the VM, create the demo session as described above. In the Google Cloud
Console, open **Compute Engine > VM instances** and click **SSH** for that VM.
The participant MUST run:

```sh
tmux attach-session -t maximal-connection-demo
```

Each authorized participant MUST open their own SSH-in-browser connection and
attach to this same session. The session host MUST be a Compute Engine VM with
the Google guest environment installed and running. For a VM without an
external IP, SSH-in-browser uses
[IAP TCP forwarding](https://docs.cloud.google.com/iap/docs/using-tcp-forwarding);
the VM firewall MUST allow SSH only from IAP's documented source range, not
from the public internet.

The Google-managed relay path is appropriate only for Google Cloud instances
and identities authorized for that project or VM. Google's public documentation
does not document `l.google.com` as a general-purpose relay endpoint for
arbitrary SSH servers. Use the Console SSH button or supported `gcloud`/IAP
workflows, not a hard-coded relay hostname.

## Acceptance and cleanup

The demonstration is complete only when:

1. local tmux, direct SSH, Google Cloud SSH-in-browser (when using a GCE host),
   the SSH-tunneled browser terminal, and the tuns URL each attach to
   `maximal-connection-demo`;
2. each path prints a fresh nonce that appears in the other attached clients;
3. an unauthorized SSH key cannot connect to the demo host;
4. every Google Cloud browser participant is authorized by IAM;
5. port `7681` is not reachable through a non-loopback host address;
6. a browser without the ttyd password cannot use the tuns URL; and
7. stopping `ttyd`, the SSH forward, and the tuns connection removes every
   test-owned client process.

Remove the session after the assertions:

```sh
tmux kill-session -t maximal-connection-demo
```
