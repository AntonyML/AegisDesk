package state

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestStoreRoundTripAndCache(t *testing.T) {
	store := Store{Root: t.TempDir()}
	config := Config{WorkerBaseURL: "https://worker.test", InstallID: "install-1", Token: "token", SIDCTarget: `C:\SIDC.exe`, Protocol: ProtocolVersion}
	if err := store.SaveConfig(config); err != nil {
		t.Fatal(err)
	}
	got, err := store.LoadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if got.InstallID != config.InstallID || got.SIDCTarget != config.SIDCTarget {
		t.Fatalf("config round trip mismatch: %#v", got)
	}
	if err := store.SaveCache("header.payload.signature"); err != nil {
		t.Fatal(err)
	}
	cache, err := store.LoadCache()
	if err != nil || cache != "header.payload.signature" {
		t.Fatalf("cache round trip failed: %q %v", cache, err)
	}
	if _, err := os.Stat(filepath.Join(store.Root, "config.json")); err != nil {
		t.Fatal(err)
	}
}

func TestResolveUsesSignedOnlineStateAndCacheWhenOffline(t *testing.T) {
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	serverTime := time.Now().UTC().Truncate(time.Second)
	cacheUntil := serverTime.Add(24 * time.Hour)
	claims := jwt.MapClaims{
		"iss":              "https://worker.test",
		"aud":              "aegisdesk-shell-v1",
		"sub":              "install-1",
		"jti":              "event-1",
		"iat":              serverTime.Unix(),
		"nbf":              serverTime.Add(-time.Second).Unix(),
		"exp":              cacheUntil.Unix(),
		"protocol_version": 1,
		"server_time":      serverTime.Format(time.RFC3339),
		"cache_until":      cacheUntil.Format(time.RFC3339),
		"contact":          map[string]any{"name": "Soporte", "ticket_url": "https://worker.test/tickets"},
		"notices":          []any{},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	token.Header["kid"] = "test-key"
	serialized, err := token.SignedString(privateKey)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("content-type", "application/json")
		_, _ = writer.Write([]byte(`{"state_token":"` + serialized + `"}`))
	}))
	defer server.Close()
	store := Store{Root: t.TempDir()}
	client := NewClient(store, NewVerifier("https://worker.test", map[string]ed25519.PublicKey{"test-key": publicKey}))
	config := Config{WorkerBaseURL: server.URL, InstallID: "install-1", Token: "token", ContactName: "Local", TicketURL: "https://worker.test/tickets"}
	first := client.Resolve(t.Context(), config, "11111111-1111-4111-8111-111111111111", "0.1.0", "unknown")
	if first.Cached || first.Contact.Name != "Soporte" {
		t.Fatalf("expected online signed state: %#v", first)
	}
	server.Close()
	second := client.Resolve(t.Context(), config, "22222222-2222-4222-8222-222222222222", "0.1.0", "unknown")
	if !second.Cached || second.Contact.Name != "Soporte" {
		t.Fatalf("expected signed cache fallback: %#v", second)
	}
}

func TestParsePublicKeyPEM(t *testing.T) {
	publicKey, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	der, err := x509Marshal(publicKey)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := ParsePublicKeyPEM(string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der})))
	if err != nil || !parsed.Equal(publicKey) {
		t.Fatalf("public key parse failed: %v", err)
	}
}

func TestEmbeddedVerifierUsesBase64PublicKey(t *testing.T) {
	publicKey, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	der, err := x509Marshal(publicKey)
	if err != nil {
		t.Fatal(err)
	}

	previousBase64 := EmbeddedPublicKeyBase64
	previousPEM := EmbeddedPublicKeyPEM
	previousKeyID := EmbeddedPublicKeyID
	previousIssuer := EmbeddedIssuer
	t.Cleanup(func() {
		EmbeddedPublicKeyBase64 = previousBase64
		EmbeddedPublicKeyPEM = previousPEM
		EmbeddedPublicKeyID = previousKeyID
		EmbeddedIssuer = previousIssuer
	})

	EmbeddedPublicKeyBase64 = base64.StdEncoding.EncodeToString(der)
	EmbeddedPublicKeyPEM = ""
	EmbeddedPublicKeyID = "test-key"
	EmbeddedIssuer = "https://worker.test"

	verifier, err := EmbeddedVerifier()
	if err != nil {
		t.Fatal(err)
	}
	if verifier.Issuer != EmbeddedIssuer {
		t.Fatalf("issuer mismatch: %q", verifier.Issuer)
	}
	if !verifier.Keys[EmbeddedPublicKeyID].Equal(publicKey) {
		t.Fatal("embedded public key was not loaded")
	}
}
