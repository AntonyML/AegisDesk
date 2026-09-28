package state

import (
	"crypto/ed25519"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var EmbeddedPublicKeyPEM string
var EmbeddedPublicKeyBase64 string
var EmbeddedPublicKeyID = "ed25519-2026-01"
var EmbeddedIssuer string

type jwtClaims struct {
	ProtocolVersion int      `json:"protocol_version"`
	ServerTime      string   `json:"server_time"`
	CacheUntil      string   `json:"cache_until"`
	Contact         Contact  `json:"contact"`
	Notices         []Notice `json:"notices"`
	jwt.RegisteredClaims
}

type Verifier struct {
	Issuer string
	Keys   map[string]ed25519.PublicKey
}

func NewVerifier(issuer string, keys map[string]ed25519.PublicKey) Verifier {
	return Verifier{Issuer: issuer, Keys: keys}
}

func EmbeddedVerifier() (Verifier, error) {
	var key ed25519.PublicKey
	var err error
	if EmbeddedPublicKeyBase64 != "" {
		der, decodeErr := base64.StdEncoding.DecodeString(EmbeddedPublicKeyBase64)
		if decodeErr != nil {
			return Verifier{}, fmt.Errorf("decode embedded public key: %w", decodeErr)
		}
		parsed, parseErr := x509.ParsePKIXPublicKey(der)
		if parseErr != nil {
			return Verifier{}, fmt.Errorf("parse embedded public key: %w", parseErr)
		}
		var ok bool
		key, ok = parsed.(ed25519.PublicKey)
		if !ok {
			return Verifier{}, fmt.Errorf("embedded public key is not Ed25519")
		}
	} else {
		key, err = ParsePublicKeyPEM(EmbeddedPublicKeyPEM)
	}
	if err != nil {
		return Verifier{}, err
	}
	return NewVerifier(EmbeddedIssuer, map[string]ed25519.PublicKey{EmbeddedPublicKeyID: key}), nil
}

func ParsePublicKeyPEM(value string) (ed25519.PublicKey, error) {
	block, _ := pem.Decode([]byte(value))
	if block == nil {
		return nil, fmt.Errorf("public key PEM is empty")
	}
	key, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse public key: %w", err)
	}
	edKey, ok := key.(ed25519.PublicKey)
	if !ok {
		return nil, fmt.Errorf("public key is not Ed25519")
	}
	return edKey, nil
}

func (v Verifier) Parse(tokenString, installID string) (State, error) {
	if v.Issuer == "" || len(v.Keys) == 0 {
		return State{}, fmt.Errorf("state verifier is not configured")
	}
	claims := &jwtClaims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (any, error) {
		if token.Method != jwt.SigningMethodEdDSA {
			return nil, fmt.Errorf("unexpected signing method %s", token.Method.Alg())
		}
		kid, ok := token.Header["kid"].(string)
		if !ok || kid == "" {
			return nil, fmt.Errorf("missing key id")
		}
		key, ok := v.Keys[kid]
		if !ok {
			return nil, fmt.Errorf("unknown key id")
		}
		return key, nil
	}, jwt.WithIssuer(v.Issuer), jwt.WithAudience("aegisdesk-shell-v1"), jwt.WithSubject(installID), jwt.WithLeeway(10*time.Second))
	if err != nil || token == nil || !token.Valid {
		return State{}, fmt.Errorf("verify state token: %w", err)
	}
	if claims.ProtocolVersion != ProtocolVersion {
		return State{}, fmt.Errorf("unsupported protocol version %d", claims.ProtocolVersion)
	}
	serverTime, err := time.Parse(time.RFC3339, claims.ServerTime)
	if err != nil {
		return State{}, fmt.Errorf("invalid server time: %w", err)
	}
	cacheUntil, err := time.Parse(time.RFC3339, claims.CacheUntil)
	if err != nil {
		return State{}, fmt.Errorf("invalid cache time: %w", err)
	}
	if !strings.EqualFold(claims.Subject, installID) {
		return State{}, fmt.Errorf("state subject does not match installation")
	}
	return State{
		InstallID:  installID,
		ServerTime: serverTime,
		CacheUntil: cacheUntil,
		Contact:    claims.Contact,
		Notices:    claims.Notices,
	}, nil
}
