package state

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestShellConfigValidation(t *testing.T) {
	valid := ShellConfig{
		SchemaVersion: 1,
		Revision:      "rev-1",
		Installation: InstallationConfig{
			ID:     "inst-123",
			Status: "active",
		},
	}
	if err := valid.Validate("inst-123"); err != nil {
		t.Fatalf("expected valid config, got error: %v", err)
	}

	// Schema version mismatch
	invalidVer := valid
	invalidVer.SchemaVersion = 2
	if err := invalidVer.Validate("inst-123"); err == nil {
		t.Fatal("expected error on unsupported schema version")
	}

	// Install ID mismatch
	if err := valid.Validate("inst-other"); err == nil {
		t.Fatal("expected error on installation ID mismatch")
	}

	// Status validation
	invalidStatus := valid
	invalidStatus.Installation.Status = "hacked"
	if err := invalidStatus.Validate("inst-123"); err == nil {
		t.Fatal("expected error on invalid status")
	}

	// Disabled and revoked are valid statuses
	for _, status := range []string{"disabled", "revoked"} {
		s := valid
		s.Installation.Status = status
		if err := s.Validate("inst-123"); err != nil {
			t.Fatalf("expected status %q to be valid, got: %v", status, err)
		}
	}
}

func TestFetchShellConfigETagAndOfflineFallback(t *testing.T) {
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	cfg := ShellConfig{
		SchemaVersion: 1,
		Revision:      "rev-abc",
		GeneratedAt:   now.Format(time.RFC3339),
		Installation: InstallationConfig{
			ID:           "inst-1",
			Status:       "disabled",
			Device:       DeviceInfo{Name: "PC-01", ShellVersion: "0.2.0", SIDCVersion: "2.0"},
			Organization: &OrganizationInfo{ID: "org-1", Name: "FEMUCARIBE"},
			Group:        &GroupInfo{ID: "grp-1", Name: "Administración"},
			User:         &AssignedUserInfo{ID: "usr-1", DisplayName: "Rocío Vargas"},
		},
		Support: SupportConfig{
			Title:    "Soporte FEMUCARIBE",
			Message:  "Contactá a soporte.",
			AreaName: "TI",
			Hours:    "L-V 8-16",
			Contacts: []SupportContact{
				{Type: "email", Label: "Correo", Value: "mailto:soporte@example.test"},
				{Type: "phone", Label: "Teléfono", Value: "tel:+50622223333"},
			},
			Links: []SupportLink{
				{Label: "Abrir ticket", URL: "https://aegisdesk.test/tickets"},
			},
		},
	}

	// Sign a config token
	claims := jwt.MapClaims{
		"iss":              "https://worker.test",
		"aud":              "aegisdesk-shell-v1",
		"sub":              "inst-1",
		"jti":              "event-config",
		"iat":              now.Unix(),
		"nbf":              now.Add(-time.Second).Unix(),
		"exp":              now.Add(24 * time.Hour).Unix(),
		"protocol_version": 1,
		"server_time":      now.Format(time.RFC3339),
		"cache_until":      now.Add(24 * time.Hour).Format(time.RFC3339),
		"config":           cfg,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	token.Header["kid"] = "test-key"
	signedToken, err := token.SignedString(privateKey)
	if err != nil {
		t.Fatal(err)
	}

	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		if r.Header.Get("If-None-Match") == `"rev-abc"` {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		w.Header().Set("etag", `"rev-abc"`)
		w.Header().Set("content-type", "application/json")
		_ = json.NewEncoder(w).Encode(ShellConfigEnvelope{
			Config:      cfg,
			ConfigToken: signedToken,
		})
	}))
	defer server.Close()

	store := Store{Root: t.TempDir()}
	verifier := NewVerifier("https://worker.test", map[string]ed25519.PublicKey{"test-key": publicKey})
	client := NewClient(store, verifier)
	baseConfig := Config{
		WorkerBaseURL: server.URL,
		InstallID:     "inst-1",
		Token:         "token-1",
		EquipmentName: "Local-PC",
	}

	// 1. Initial fetch -> 200 OK
	effective, isOffline := client.ResolveEffectiveConfig(t.Context(), baseConfig, "0.2.0", "unknown", nil)
	if isOffline {
		t.Fatal("expected online config")
	}
	if effective.Installation.Status != "disabled" {
		t.Fatalf("expected status disabled, got %s", effective.Installation.Status)
	}
	if effective.Installation.Organization == nil || effective.Installation.Organization.Name != "FEMUCARIBE" {
		t.Fatalf("expected organization FEMUCARIBE, got %#v", effective.Installation.Organization)
	}

	// Verify it was saved to cache
	cached, err := store.LoadShellConfig()
	if err != nil || cached.Revision != "rev-abc" {
		t.Fatalf("expected cache to be saved with revision rev-abc, got err: %v, cache: %#v", err, cached)
	}

	// 2. Second fetch with ETag -> 304 Not Modified
	effective2, isOffline2 := client.ResolveEffectiveConfig(t.Context(), baseConfig, "0.2.0", "unknown", nil)
	if isOffline2 {
		t.Fatal("expected online (not modified)")
	}
	if effective2.Revision != "rev-abc" {
		t.Fatalf("expected revision rev-abc, got %s", effective2.Revision)
	}

	// 3. Worker goes down -> offline fallback to cached config (must remain disabled!)
	server.Close()
	effective3, isOffline3 := client.ResolveEffectiveConfig(t.Context(), baseConfig, "0.2.0", "unknown", nil)
	if !isOffline3 {
		t.Fatal("expected offline fallback")
	}
	if effective3.Installation.Status != "disabled" {
		t.Fatalf("expected disabled status to be preserved offline, got %s", effective3.Installation.Status)
	}
	if effective3.Installation.User == nil || effective3.Installation.User.DisplayName != "Rocío Vargas" {
		t.Fatalf("expected user Rocío Vargas in offline cache, got %#v", effective3.Installation.User)
	}
}

func TestResolveEffectiveConfigNoCacheFallback(t *testing.T) {
	store := Store{Root: t.TempDir()}
	client := NewClient(store, Verifier{})
	baseConfig := Config{
		WorkerBaseURL: "http://127.0.0.1:59999", // down
		InstallID:     "inst-offline",
		Token:         "token-1",
		EquipmentName: "Fallback-PC",
		ContactName:   "Admin Helpdesk",
		TicketURL:     "https://ticket.test",
	}

	effective, isOffline := client.ResolveEffectiveConfig(t.Context(), baseConfig, "0.2.0", "2.01", nil)
	if !isOffline {
		t.Fatal("expected offline fallback")
	}
	if effective.Installation.Status != "active" {
		t.Fatalf("expected default status active, got %s", effective.Installation.Status)
	}
	if effective.Installation.Device.Name != "Fallback-PC" {
		t.Fatalf("expected equipment Fallback-PC, got %s", effective.Installation.Device.Name)
	}
	if effective.Support.AreaName != "Admin Helpdesk" {
		t.Fatalf("expected contact Admin Helpdesk, got %s", effective.Support.AreaName)
	}
}

func TestCorruptedResponseDoesNotDestroyCache(t *testing.T) {
	store := Store{Root: t.TempDir()}
	client := NewClient(store, Verifier{})
	valid := ShellConfig{
		SchemaVersion: 1,
		Revision:      "good-revision",
		Installation: InstallationConfig{
			ID:     "inst-1",
			Status: "active",
		},
	}
	if err := store.SaveShellConfig(valid); err != nil {
		t.Fatal(err)
	}

	// Server returns garbage JSON
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("content-type", "application/json")
		_, _ = w.Write([]byte(`{ "invalid_json": true, [bad syntax`))
	}))
	defer server.Close()

	baseConfig := Config{
		WorkerBaseURL: server.URL,
		InstallID:     "inst-1",
		Token:         "token",
	}
	effective, isOffline := client.ResolveEffectiveConfig(t.Context(), baseConfig, "0.2.0", "unknown", nil)
	if !isOffline {
		t.Fatal("expected fallback to cache on corrupt server response")
	}
	if effective.Revision != "good-revision" {
		t.Fatalf("expected cached revision to be retained, got %s", effective.Revision)
	}

	// Cache in store should still be valid
	loaded, err := store.LoadShellConfig()
	if err != nil || loaded.Revision != "good-revision" {
		t.Fatalf("expected cache file on disk to remain intact, got %v, %#v", err, loaded)
	}
}
