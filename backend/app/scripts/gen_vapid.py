"""Generate a VAPID keypair for Web Push.

Usage:
    python -m app.scripts.gen_vapid

Prints three env vars. Put them in `.env` (and your production environment).
Keep VAPID_PRIVATE_KEY_B64 secret; the public key is safe to expose.
"""

import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def main() -> None:
    key = ec.generate_private_key(ec.SECP256R1())
    private_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    public_point = key.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    public_key = base64.urlsafe_b64encode(public_point).rstrip(b"=").decode()
    private_b64 = base64.b64encode(private_pem.encode()).decode()

    print("VAPID_PUBLIC_KEY=" + public_key)
    print("VAPID_PRIVATE_KEY_B64=" + private_b64)


if __name__ == "__main__":
    main()
