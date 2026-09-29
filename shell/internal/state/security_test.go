package state

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestVerifierRejectsMissingTokenKeyAndBadSignature(t *testing.T) {
	if _, err := (Verifier{}).Parse("", "install-1"); err == nil {
		t.Fatal("expected missing verifier configuration to fail")
	}
	publicKey, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	_, wrongPrivate, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC().Truncate(time.Second)
	claims := jwt.MapClaims{
		"iss":              "https://worker.test",
		"aud":              "aegisdesk-shell-v1",
		"sub":              "install-1",
		"iat":              now.Unix(),
		"nbf":              now.Add(-time.Second).Unix(),
		"exp":              now.Add(time.Hour).Unix(),
		"protocol_version": 1,
		"server_time":      now.Format(time.RFC3339),
		"cache_until":      now.Add(time.Hour).Format(time.RFC3339),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	token.Header["kid"] = "key-1"
	serialized, err := token.SignedString(wrongPrivate)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := NewVerifier("https://worker.test", map[string]ed25519.PublicKey{"key-1": publicKey}).Parse(serialized, "install-1"); err == nil {
		t.Fatal("expected invalid signature to fail")
	}
}

func TestSignedPolicyCacheDispositionAndDefaults(t *testing.T) {
	now := time.Unix(2_000_000_000, 0).UTC()
	policy := SignedPolicy{
		IssuedAt:            now.Add(-11 * time.Second).Unix(),
		CacheMaxAgeSeconds:  10,
		OfflineGraceSeconds: 20,
		ExpiresAt:           now.Add(19 * time.Second).Unix(),
	}
	if got := policy.CacheDisposition(now, now); got != CacheGrace {
		t.Fatalf("expected grace cache, got %s", got)
	}
	if got := policy.CacheDisposition(now.Add(20*time.Second), now.Add(20*time.Second)); got != CacheExpired {
		t.Fatalf("expected expired cache, got %s", got)
	}
	defaults := (SignedPolicy{}).WithDefaults(now)
	if defaults.CacheMaxAgeSeconds != DefaultCacheMaxAgeSeconds || defaults.OfflineGraceSeconds != DefaultOfflineGraceSeconds {
		t.Fatalf("unexpected default policy: %#v", defaults)
	}
}

func TestStoreRejectsPolicyRollbackAndMitigatesClockRollback(t *testing.T) {
	store := Store{Root: t.TempDir()}
	serverTime := time.Unix(2_000_000_000, 0).UTC()
	newer := SignedPolicy{IssuedAt: serverTime.Unix(), ExpiresAt: serverTime.Add(time.Hour).Unix()}
	if err := store.AcceptPolicy("config", newer, serverTime); err != nil {
		t.Fatal(err)
	}
	if !store.IsPolicyRollback("config", newer.IssuedAt-1) {
		t.Fatal("expected older iat to be rejected")
	}
	if err := store.AcceptPolicy("config", SignedPolicy{IssuedAt: newer.IssuedAt - 1, ExpiresAt: newer.ExpiresAt}, serverTime); !errors.Is(err, ErrPolicyRollback) {
		t.Fatalf("expected rollback error, got %v", err)
	}
	if got := store.EffectiveNow(time.Unix(newer.IssuedAt-10, 0).UTC()); got.Unix() != serverTime.Unix() {
		t.Fatalf("expected last server time to win after clock rollback, got %v", got)
	}
}

func TestOfflineStatusIsNotReplacedByPackagedActiveFallback(t *testing.T) {
	for _, status := range []string{"disabled", "revoked"} {
		t.Run(status, func(t *testing.T) {
			store := Store{Root: t.TempDir()}
			config := Config{
				WorkerBaseURL: "http://127.0.0.1:1",
				InstallID:     "install-1",
				Token:         "token",
				SIDCTarget:    `C:\\SIDC.exe`,
			}
			now := time.Now().UTC().Truncate(time.Second)
			cached := DefaultShellConfig(config, "test", "unknown")
			cached.Installation.Status = status
			cached.GeneratedAt = now.Format(time.RFC3339)
			cached.Policy = SignedPolicy{
				IssuedAt:            now.Unix(),
				ExpiresAt:           now.Add(24 * time.Hour).Unix(),
				CacheMaxAgeSeconds:  24 * 60 * 60,
				OfflineGraceSeconds: 24 * 60 * 60,
			}
			if err := store.SaveShellConfig(cached); err != nil {
				t.Fatal(err)
			}
			client := NewClient(store, Verifier{})
			got, _ := client.ResolveEffectiveConfig(context.Background(), config, "test", "unknown", nil)
			if got.Installation.Status != status {
				t.Fatalf("offline status changed from %q to %q", status, got.Installation.Status)
			}
		})
	}
}

func TestResolveEffectiveConfigAppliesCacheGraceAndExpiry(t *testing.T) {
	config := Config{
		WorkerBaseURL: "http://127.0.0.1:1",
		InstallID:     "install-1",
		Token:         "token",
		SIDCTarget:    `C:\\SIDC.exe`,
	}
	now := time.Now().UTC().Truncate(time.Second)

	t.Run("inside grace", func(t *testing.T) {
		store := Store{Root: t.TempDir()}
		cached := DefaultShellConfig(config, "test", "unknown")
		cached.GeneratedAt = now.Add(-2 * time.Second).Format(time.RFC3339)
		cached.Policy = SignedPolicy{
			IssuedAt:            now.Add(-2 * time.Second).Unix(),
			ExpiresAt:           now.Add(9 * time.Second).Unix(),
			CacheMaxAgeSeconds:  1,
			OfflineGraceSeconds: 10,
		}
		if err := store.SaveShellConfig(cached); err != nil {
			t.Fatal(err)
		}
		got, offline := NewClient(store, Verifier{}).ResolveEffectiveConfig(context.Background(), config, "test", "unknown", nil)
		if !offline || got.CacheState != CacheGrace || got.Installation.Status != "active" {
			t.Fatalf("expected active grace fallback, got offline=%v state=%q status=%q", offline, got.CacheState, got.Installation.Status)
		}
	})

	t.Run("outside grace", func(t *testing.T) {
		store := Store{Root: t.TempDir()}
		cached := DefaultShellConfig(config, "test", "unknown")
		cached.GeneratedAt = now.Add(-12 * time.Second).Format(time.RFC3339)
		cached.Policy = SignedPolicy{
			IssuedAt:            now.Add(-12 * time.Second).Unix(),
			ExpiresAt:           now.Add(-1 * time.Second).Unix(),
			CacheMaxAgeSeconds:  1,
			OfflineGraceSeconds: 10,
		}
		if err := store.SaveShellConfig(cached); err != nil {
			t.Fatal(err)
		}
		got, offline := NewClient(store, Verifier{}).ResolveEffectiveConfig(context.Background(), config, "test", "unknown", nil)
		if !offline || got.CacheState != CacheUnavailable || got.Installation.Status != "disabled" {
			t.Fatalf("expected unavailable expired fallback, got offline=%v state=%q status=%q", offline, got.CacheState, got.Installation.Status)
		}
	})
}

func TestConfigDoesNotPersistBearerTokenInJSON(t *testing.T) {
	store := Store{Root: t.TempDir()}
	config := Config{
		WorkerBaseURL: "https://worker.test",
		InstallID:     "install-1",
		Token:         "secret-token",
		SIDCTarget:    `C:\SIDC.exe`,
	}
	if err := store.SaveConfig(config); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(store.Root, "config.json"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), config.Token) || strings.Contains(string(data), "installation_token") {
		t.Fatalf("config.json contains the bearer token: %s", data)
	}
	loaded, err := store.LoadConfig()
	if err != nil || loaded.Token != config.Token {
		t.Fatalf("protected token round trip failed: %#v %v", loaded, err)
	}
}

func TestTermsAcceptanceValidation(t *testing.T) {
	now := time.Now().UTC()
	acceptance := TermsAcceptance{
		TermsVersion: "0.1.0",
		TermsSha256:  "abc",
		AcceptedAt:   now.Format(time.RFC3339),
		Method:       "installer",
	}
	if !acceptance.ValidFor("0.1.0", "ABC", now) {
		t.Fatal("expected acceptance to validate case-insensitively")
	}
	previous := acceptance
	previous.TermsVersion = "0.1.0-draft"
	if previous.ValidFor("0.1.0", "abc", now) {
		t.Fatal("draft acceptance must not validate the published version")
	}
	acceptance.Method = "unknown"
	if acceptance.ValidFor("0.1.0", "abc", now) {
		t.Fatal("unexpected valid acceptance method")
	}
}

func TestSecurityMetadataIsJSON(t *testing.T) {
	store := Store{Root: t.TempDir()}
	if err := store.AcceptPolicy("state", SignedPolicy{IssuedAt: 100, ExpiresAt: 200}, time.Unix(100, 0).UTC()); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(store.Root, "security.json"))
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded["last_state_issued_at"] != float64(100) {
		t.Fatalf("unexpected security metadata: %#v", decoded)
	}
}
