# Trusting a corporate/proxy root CA during the Docker build

If you build this image on a network that TLS-inspects outbound traffic
(a corporate VPN/proxy, e.g. Zscaler), `apk add` and `npm ci` inside the build
fail with errors like `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` or
`TLS: server certificate not trusted`, because the proxy re-signs HTTPS
traffic with its own root certificate.

**Fix:** export your organization's root CA certificate as a PEM file (on
macOS: Keychain Access, System keychain, "Certificates", export as `.pem`) and
drop it in this directory, e.g. `certs/corporate-root-ca.pem`. Any `*.crt` or
`*.pem` file here is trusted by the build before any network call runs. These
files are git-ignored (only this README is tracked).

Not behind an inspecting proxy (e.g. building on the NAS or via GitHub
Actions)? Leave this directory empty.
