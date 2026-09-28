package main

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"os"
	"os/user"
	"path/filepath"
	"strings"
	"time"

	"aegisdesk-shell/internal/launch"
	"aegisdesk-shell/internal/state"
	"aegisdesk-shell/internal/ui"
)

func main() {
	store := state.DefaultStore()
	logger, loggerErr := ui.NewLogger(store.Root)
	if loggerErr == nil {
		defer logger.Close()
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
	client := state.NewClient(store, verifier)
	openID := newOpenID()
	resolved := client.Resolve(context.Background(), config, openID, version, "unknown")
	if resolved.Failure != "" && logger != nil {
		logger.Printf("state resolution fallback: %s", resolved.Failure)
	}
	contact := resolved.Contact
	if contact.Name == "" {
		contact = state.Contact{Name: config.ContactName, TicketURL: config.TicketURL}
	}
	dialogs.Contact(context.Background(), contact)

	for _, notice := range resolved.Notices {
		if notice.RequiresConsent {
			continue
		}
		dialogs.Notice(context.Background(), notice)
	}

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
		WindowsUser:     windowsUser(),
		EquipmentName:   config.EquipmentName,
		ShellVersion:    version,
		SIDCVersion:     "unknown",
		LaunchResult:    launchResult,
	})
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

func windowsUser() string {
	current, err := user.Current()
	if err != nil || current.Username == "" {
		return "unknown"
	}
	name := current.Username
	if index := strings.LastIndex(name, `\`); index >= 0 {
		name = name[index+1:]
	}
	return name
}
