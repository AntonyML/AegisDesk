package state

import (
	"crypto/ed25519"
	"crypto/x509"
)

func x509Marshal(key ed25519.PublicKey) ([]byte, error) {
	return x509.MarshalPKIXPublicKey(key)
}
