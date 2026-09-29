package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"aegisdesk-shell/internal/launch"
	"aegisdesk-shell/internal/state"
	"aegisdesk-shell/internal/ui"
)

func main() {
	supportOnly := false
	allowUnsignedDev := false
	for _, arg := range os.Args[1:] {
		switch strings.ToLower(arg) {
		case "--support", "-support", "--soporte", "-soporte", "/support", "/soporte":
			supportOnly = true
		case "--allowunsigneddev", "-allowunsigneddev":
			allowUnsignedDev = true
		}
	}

	store := state.DefaultStore()
	if err := store.Ensure(); err != nil {
		return
	}
	logger, loggerErr := ui.NewLogger(store.Root)
	if loggerErr == nil {
		defer logger.Close()
	}
	if securityMode == "UNSIGNED_DEV" && !allowUnsignedDev {
		if logger != nil {
			logger.Printf("build UNSIGNED_DEV requires explicit -AllowUnsignedDev; refusing to start")
		}
		return
	}
	if allowUnsignedDev && logger != nil {
		logger.Printf("UNSIGNED DEVELOPMENT MODE ENABLED (-AllowUnsignedDev); signed configuration checks are bypassed")
	}
	dialogs := ui.Zenity{}
	config, err := store.LoadConfig()
	if errors.Is(err, state.ErrNotConfigured) {
		config, err = configure(context.Background(), store, dialogs, logger)
	}
	if err != nil {
		if logger != nil {
			logger.Printf("configuration failed: %v", err)
		}
		return
	}

	target, err := launch.ValidateTarget(config.SIDCTarget)
	if err != nil {
		if logger != nil {
			logger.Printf("configured SIDC target invalid: %v", err)
		}
		return
	}
	config.SIDCTarget = target

	verifier := state.Verifier{}
	state.EmbeddedIssuer = stateIssuer
	state.EmbeddedPublicKeyID = stateKeyID
	if embedded, verifierErr := state.EmbeddedVerifier(); verifierErr == nil {
		verifier = embedded
	}
	if !allowUnsignedDev && (verifier.Issuer == "" || len(verifier.Keys) == 0) {
		if logger != nil {
			logger.Printf("signed configuration verifier is not configured; refusing to start")
		}
		return
	}
	if allowUnsignedDev {
		verifier.Issuer = stateIssuer
	}
	client := state.NewClientWithOptions(store, verifier, allowUnsignedDev)
	openID := newOpenID()

	// 1. Synchronize remote configuration from worker with ETag / cache fallback
	effectiveConfig, isOffline := client.ResolveEffectiveConfig(context.Background(), config, version, "unknown", logger)
	addLegalLinks(&effectiveConfig)
	if effectiveConfig.CacheState == state.CacheExpired || effectiveConfig.CacheState == state.CacheUnavailable {
		dialogs.Support(context.Background(), ui.SupportOptions{
			Config:    effectiveConfig,
			Status:    "disabled",
			IsOffline: true,
			AutoClose: 0,
		})
		return
	}
	if accepted := ensureTermsAccepted(context.Background(), store, client, config, effectiveConfig.Policy, dialogs, logger); !accepted {
		dialogs.Support(context.Background(), ui.SupportOptions{
			Config:    effectiveConfig,
			Status:    "disabled",
			IsOffline: isOffline,
			AutoClose: 0,
		})
		return
	}
	flushPendingTerms(context.Background(), store, client, config, logger)
	effectiveStatus := effectiveConfig.Installation.Status
	if effectiveStatus == "" {
		effectiveStatus = "active"
	}

	// 2. Check administrative blocking policy (DISABLED)
	if effectiveStatus == "disabled" || effectiveStatus == "revoked" {
		if logger != nil {
			logger.Printf("launch blocked: installation disabled")
		}
		_ = client.SendEvent(context.Background(), config, state.Event{
			ProtocolVersion: state.ProtocolVersion,
			OpenID:          openID,
			Type:            "launch_result",
			EquipmentName:   config.EquipmentName,
			ShellVersion:    version,
			SIDCVersion:     "unknown",
			LaunchResult:    "not_attempted",
		})
		dialogs.Support(context.Background(), ui.SupportOptions{
			Config:    effectiveConfig,
			Status:    "disabled",
			IsOffline: isOffline,
			AutoClose: 0,
		})
		return
	}

	// 3. Support-only mode
	if supportOnly {
		if logger != nil {
			logger.Printf("support opened manually")
		}
		dialogs.Support(context.Background(), ui.SupportOptions{
			Config:    effectiveConfig,
			Status:    effectiveStatus,
			IsOffline: isOffline,
			AutoClose: 0,
		})
		return
	}

	// 4. Normal active launch flow
	resolved := client.Resolve(context.Background(), config, openID, version, "unknown")
	if resolved.Failure != "" && logger != nil {
		logger.Printf("state resolution fallback: %s", resolved.Failure)
	}

	// Present modern support dialog with auto-close
	dialogs.Support(context.Background(), ui.SupportOptions{
		Config:    effectiveConfig,
		Status:    "active",
		IsOffline: isOffline || effectiveConfig.CacheState == state.CacheGrace,
		AutoClose: 4 * time.Second,
	})

	for _, notice := range resolved.Notices {
		if notice.RequiresConsent {
			continue
		}
		dialogs.Notice(context.Background(), notice)
	}

	// Maintenance cycle consent door
	if notice, required := resolved.ExpiredNotice(); required {
		_ = client.SendEvent(context.Background(), config, state.Event{
			ProtocolVersion: state.ProtocolVersion,
			OpenID:          openID,
			Type:            "consent_required",
			EquipmentName:   config.EquipmentName,
			ShellVersion:    version,
			SIDCVersion:     "unknown",
			ConsentState:    "required",
		})
		accepted := dialogs.Consent(context.Background(), notice)
		countdownEvent := "countdown_completed"
		if accepted {
			_ = client.SendEvent(context.Background(), config, state.Event{ProtocolVersion: state.ProtocolVersion, OpenID: openID, Type: countdownEvent, EquipmentName: config.EquipmentName, ShellVersion: version, ConsentState: "accepted"})
			_ = client.SendEvent(context.Background(), config, state.Event{ProtocolVersion: state.ProtocolVersion, OpenID: openID, Type: "consent_accepted", EquipmentName: config.EquipmentName, ShellVersion: version, ConsentState: "accepted"})
		} else {
			_ = client.SendEvent(context.Background(), config, state.Event{ProtocolVersion: state.ProtocolVersion, OpenID: openID, Type: countdownEvent, EquipmentName: config.EquipmentName, ShellVersion: version, ConsentState: "declined"})
			_ = client.SendEvent(context.Background(), config, state.Event{ProtocolVersion: state.ProtocolVersion, OpenID: openID, Type: "consent_declined", EquipmentName: config.EquipmentName, ShellVersion: version, ConsentState: "declined"})
			return
		}
	}

	// Launch SIDC executable
	launchResult := "success"
	if err := launch.Start(context.Background(), config.SIDCTarget); err != nil {
		launchResult = "failed"
		if logger != nil {
			logger.Printf("SIDC launch failed: %v", err)
		}
	}
	_ = client.SendEvent(context.Background(), config, state.Event{
		ProtocolVersion: state.ProtocolVersion,
		OpenID:          openID,
		Type:            "launch_result",
		EquipmentName:   config.EquipmentName,
		ShellVersion:    version,
		SIDCVersion:     "unknown",
		LaunchResult:    launchResult,
	})
}

func ensureTermsAccepted(ctx context.Context, store state.Store, client state.Client, config state.Config, policy state.SignedPolicy, dialogs ui.Dialogs, logger *ui.Logger) bool {
	version := policy.RequiredTermsVersion
	if version == "" {
		version = "0.1.0-draft"
	}
	hash := termsHashForVersion(version)
	if hash == "" {
		if logger != nil {
			logger.Printf("required terms version %s is not installed with this shell", version)
		}
		return false
	}
	now := time.Now().UTC()
	acceptance, err := store.LoadTermsAcceptance()
	method := "first-run"
	if err == nil && acceptance.TermsVersion != "" {
		method = "reacceptance"
	}
	if err == nil && acceptance.ValidFor(version, hash, now) {
		acceptance.ShellVersion = versionString()
		if reportErr := client.SendTermsAcceptance(ctx, config, acceptance); reportErr != nil {
			_ = store.SavePendingTermsAcceptance(acceptance)
		}
		return true
	}
	if !dialogs.TermsAcceptance(ctx, version, policy.TermsURL, policy.PrivacyURL) {
		if logger != nil {
			logger.Printf("terms acceptance rejected; telemetry and SIDC launch skipped")
		}
		return false
	}
	acceptance = state.TermsAcceptance{
		TermsVersion: version,
		TermsSha256:  hash,
		AcceptedAt:   now.Format(time.RFC3339),
		Method:       method,
		ShellVersion: versionString(),
	}
	if err := store.SaveTermsAcceptance(acceptance); err != nil {
		if logger != nil {
			logger.Printf("failed to save terms acceptance: %v", err)
		}
		return false
	}
	if err := client.SendTermsAcceptance(ctx, config, acceptance); err != nil {
		_ = store.SavePendingTermsAcceptance(acceptance)
		if logger != nil {
			logger.Printf("terms acceptance queued for retry: %v", err)
		}
	}
	return true
}

func flushPendingTerms(ctx context.Context, store state.Store, client state.Client, config state.Config, logger *ui.Logger) {
	pending, err := store.LoadPendingTermsAcceptance()
	if err != nil {
		return
	}
	pending.ShellVersion = versionString()
	if err := client.SendTermsAcceptance(ctx, config, pending); err != nil {
		if logger != nil {
			logger.Printf("pending terms acceptance remains queued: %v", err)
		}
		return
	}
	_ = store.ClearPendingTermsAcceptance()
}

func termsHashForVersion(version string) string {
	if version == "0.1.0-draft" && termsSHA256 != "" {
		return strings.ToLower(termsSHA256)
	}
	executable, err := os.Executable()
	if err != nil {
		return ""
	}
	filename := "terms-" + version + ".es.md"
	candidates := []string{
		filepath.Join(filepath.Dir(executable), "LICENSES", filename),
		filepath.Join(filepath.Dir(executable), filename),
		filepath.Join(filepath.Dir(executable), "..", "docs", "legal", filename),
	}
	for _, candidate := range candidates {
		data, readErr := os.ReadFile(candidate)
		if readErr == nil {
			sum := sha256.Sum256(data)
			return hex.EncodeToString(sum[:])
		}
	}
	return ""
}

func versionString() string { return version }

func addLegalLinks(config *state.ShellConfig) {
	for _, candidate := range []state.SupportLink{
		{Label: "Términos", URL: config.Policy.TermsURL},
		{Label: "Privacidad", URL: config.Policy.PrivacyURL},
	} {
		if candidate.URL == "" || !ui.IsSafeURL(candidate.URL) {
			continue
		}
		found := false
		for _, existing := range config.Support.Links {
			if strings.EqualFold(existing.Label, candidate.Label) {
				found = true
				break
			}
		}
		if !found {
			config.Support.Links = append(config.Support.Links, candidate)
		}
	}
	if strings.TrimSpace(config.Support.Notice) == "" {
		config.Support.Notice = "Documentos legales: carpeta LICENSES de la instalación."
	} else if !strings.Contains(strings.ToLower(config.Support.Notice), "documentos legales") {
		config.Support.Notice = strings.TrimSuffix(strings.TrimSpace(config.Support.Notice), ".") + ". Documentos legales: carpeta LICENSES de la instalación."
	}
}

func configure(ctx context.Context, store state.Store, dialogs ui.Dialogs, logger *ui.Logger) (state.Config, error) {
	if workerBaseURL == "" || strings.Contains(workerBaseURL, "example.invalid") {
		return state.Config{}, fmt.Errorf("worker URL is not configured in this build")
	}
	code, err := dialogs.EnrollmentCode(ctx)
	if err != nil {
		return state.Config{}, fmt.Errorf("enrollment code dialog: %w", err)
	}
	path, err := dialogs.SelectSIDC(ctx)
	if err != nil {
		return state.Config{}, fmt.Errorf("SIDC path dialog: %w", err)
	}
	target, err := launch.ValidateTarget(path)
	if err != nil {
		return state.Config{}, err
	}
	equipmentName, _ := os.Hostname()
	client := state.NewClient(store, state.Verifier{})
	config, err := client.Enroll(ctx, workerBaseURL, strings.TrimSpace(code), map[string]any{
		"protocol_version": state.ProtocolVersion,
		"shell_version":    version,
		"sidc_version":     "unknown",
		"equipment_name":   equipmentName,
		"sidc_target":      target,
	})
	if err != nil {
		return state.Config{}, err
	}
	config.SIDCTarget = target
	if err := store.SaveConfig(config); err != nil {
		return state.Config{}, err
	}
	shellPath, err := os.Executable()
	if err != nil {
		return state.Config{}, err
	}
	if err := launch.CreateDesktopShortcut(shellPath, filepath.Dir(target), "SIDC"); err != nil && logger != nil {
		logger.Printf("desktop shortcut failed: %v", err)
	}
	return config, nil
}

func newOpenID() string {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return fmt.Sprintf("00000000-0000-4000-8000-%012d", time.Now().UnixNano()%1_000_000_000_000)
	}
	value[6] = (value[6] & 0x0f) | 0x40
	value[8] = (value[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", value[0:4], value[4:6], value[6:8], value[8:10], value[10:16])
}
