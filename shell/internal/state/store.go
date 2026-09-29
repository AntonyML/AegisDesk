package state

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

var ErrNotConfigured = errors.New("aegisdesk is not configured")
var ErrPolicyRollback = errors.New("signed policy rollback detected")

type Store struct {
	Root       string
	LegacyRoot string
}

func DefaultStore() Store {
	root := os.Getenv("LOCALAPPDATA")
	if root == "" {
		if configDir, err := os.UserConfigDir(); err == nil {
			root = configDir
		}
	}
	if root == "" {
		root = os.Getenv("ProgramData")
	}
	if root == "" {
		root = `C:\ProgramData`
	}
	legacyRoot := os.Getenv("ProgramData")
	if legacyRoot == "" {
		legacyRoot = `C:\ProgramData`
	}
	return Store{
		Root:       filepath.Join(root, "AegisDesk"),
		LegacyRoot: filepath.Join(legacyRoot, "AegisDesk"),
	}
}

func (s Store) Ensure() error {
	if err := os.MkdirAll(s.Root, 0o700); err != nil {
		return fmt.Errorf("create state directory: %w", err)
	}
	if err := applyStateACL(s.Root); err != nil {
		return fmt.Errorf("secure state directory: %w", err)
	}
	return nil
}

type configOnDisk struct {
	WorkerBaseURL string `json:"worker_base_url"`
	InstallID     string `json:"install_id"`
	Token         string `json:"installation_token,omitempty"`
	SIDCTarget    string `json:"sidc_target"`
	EquipmentName string `json:"equipment_name"`
	ContactName   string `json:"contact_name"`
	TicketURL     string `json:"ticket_url"`
	Protocol      int    `json:"protocol_version"`
}

func (s Store) LoadConfig() (Config, error) {
	path := filepath.Join(s.Root, "config.json")
	data, err := os.ReadFile(path)
	fromLegacy := false
	if errors.Is(err, os.ErrNotExist) && s.LegacyRoot != "" && !samePath(s.Root, s.LegacyRoot) {
		path = filepath.Join(s.LegacyRoot, "config.json")
		data, err = os.ReadFile(path)
		fromLegacy = err == nil
	}
	if errors.Is(err, os.ErrNotExist) {
		return Config{}, ErrNotConfigured
	}
	if err != nil {
		return Config{}, fmt.Errorf("read config: %w", err)
	}
	var disk configOnDisk
	if err := json.Unmarshal(data, &disk); err != nil {
		return Config{}, fmt.Errorf("parse config: %w", err)
	}
	config := Config{
		WorkerBaseURL: disk.WorkerBaseURL,
		InstallID:     disk.InstallID,
		SIDCTarget:    disk.SIDCTarget,
		EquipmentName: disk.EquipmentName,
		ContactName:   disk.ContactName,
		TicketURL:     disk.TicketURL,
		Protocol:      disk.Protocol,
	}
	if disk.Token != "" {
		config.Token = disk.Token
	} else if protected, protectedErr := loadProtectedToken(filepath.Join(s.Root, "token.dpapi")); protectedErr == nil {
		config.Token = protected
	}
	if config.Token == "" {
		return Config{}, fmt.Errorf("config is missing protected installation token")
	}
	if config.WorkerBaseURL == "" || config.InstallID == "" || config.SIDCTarget == "" {
		return Config{}, fmt.Errorf("config is incomplete")
	}
	if disk.Token != "" || fromLegacy {
		if saveErr := s.SaveConfig(config); saveErr != nil {
			return Config{}, fmt.Errorf("migrate installation token: %w", saveErr)
		}
		if fromLegacy {
			_ = os.Remove(path)
		}
	}
	return config, nil
}

func (s Store) SaveConfig(config Config) error {
	if strings.TrimSpace(config.Token) == "" {
		return fmt.Errorf("installation token is empty")
	}
	if err := s.Ensure(); err != nil {
		return err
	}
	if err := saveProtectedToken(filepath.Join(s.Root, "token.dpapi"), config.Token); err != nil {
		return fmt.Errorf("protect installation token: %w", err)
	}
	return s.atomicJSON("config.json", configOnDisk{
		WorkerBaseURL: config.WorkerBaseURL,
		InstallID:     config.InstallID,
		SIDCTarget:    config.SIDCTarget,
		EquipmentName: config.EquipmentName,
		ContactName:   config.ContactName,
		TicketURL:     config.TicketURL,
		Protocol:      config.Protocol,
	})
}

func (s Store) LoadCache() (string, error) {
	data, err := os.ReadFile(filepath.Join(s.Root, "state.jwt"))
	if errors.Is(err, os.ErrNotExist) {
		return "", ErrNotConfigured
	}
	if err != nil {
		return "", fmt.Errorf("read state cache: %w", err)
	}
	if len(data) == 0 || len(data) > 128*1024 {
		return "", fmt.Errorf("state cache has invalid size")
	}
	return string(data), nil
}

func (s Store) SaveCache(token string) error {
	if token == "" || len(token) > 128*1024 {
		return fmt.Errorf("state token has invalid size")
	}
	if err := s.Ensure(); err != nil {
		return err
	}
	return s.atomicText("state.jwt", token)
}

func (s Store) LoadShellConfig() (ShellConfig, error) {
	data, err := os.ReadFile(filepath.Join(s.Root, "shell_config.json"))
	if errors.Is(err, os.ErrNotExist) {
		return ShellConfig{}, ErrNotConfigured
	}
	if err != nil {
		return ShellConfig{}, fmt.Errorf("read shell config cache: %w", err)
	}
	var config ShellConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return ShellConfig{}, fmt.Errorf("parse shell config cache: %w", err)
	}
	return config, nil
}

func (s Store) SaveShellConfig(config ShellConfig) error {
	if err := s.Ensure(); err != nil {
		return err
	}
	return s.atomicJSON("shell_config.json", config)
}

type securityMetadata struct {
	LastConfigIssuedAt int64 `json:"last_config_issued_at"`
	LastStateIssuedAt  int64 `json:"last_state_issued_at"`
	LastServerTime     int64 `json:"last_server_time"`
	ConfigSynced       bool  `json:"config_synced"`
}

func (s Store) AcceptPolicy(kind string, policy SignedPolicy, serverTime time.Time) error {
	policy = policy.WithDefaults(serverTime)
	metadata, err := s.loadSecurityMetadata()
	if err != nil {
		return err
	}
	var previous *int64
	switch kind {
	case "config":
		previous = &metadata.LastConfigIssuedAt
	case "state":
		previous = &metadata.LastStateIssuedAt
	default:
		return fmt.Errorf("unknown policy kind %q", kind)
	}
	if *previous > policy.IssuedAt {
		return ErrPolicyRollback
	}
	*previous = policy.IssuedAt
	if serverTime.Unix() > metadata.LastServerTime {
		metadata.LastServerTime = serverTime.Unix()
	}
	if kind == "config" {
		metadata.ConfigSynced = true
	}
	return s.saveSecurityMetadata(metadata)
}

func (s Store) IsPolicyRollback(kind string, issuedAt int64) bool {
	metadata, err := s.loadSecurityMetadata()
	if err != nil {
		return true
	}
	switch kind {
	case "config":
		return metadata.LastConfigIssuedAt > issuedAt
	case "state":
		return metadata.LastStateIssuedAt > issuedAt
	default:
		return true
	}
}

func (s Store) HasSuccessfulConfigSync() bool {
	metadata, err := s.loadSecurityMetadata()
	return err == nil && metadata.ConfigSynced
}

func (s Store) EffectiveNow(now time.Time) time.Time {
	metadata, err := s.loadSecurityMetadata()
	if err == nil && metadata.LastServerTime > now.Unix() {
		return time.Unix(metadata.LastServerTime, 0).UTC()
	}
	return now
}

func (s Store) LoadTermsAcceptance() (TermsAcceptance, error) {
	return s.loadTermsFile("terms-acceptance.json")
}

func (s Store) SaveTermsAcceptance(acceptance TermsAcceptance) error {
	if err := s.Ensure(); err != nil {
		return err
	}
	return s.atomicJSON("terms-acceptance.json", acceptance)
}

func (s Store) LoadPendingTermsAcceptance() (TermsAcceptance, error) {
	return s.loadTermsFile("terms-acceptance.pending.json")
}

func (s Store) SavePendingTermsAcceptance(acceptance TermsAcceptance) error {
	if err := s.Ensure(); err != nil {
		return err
	}
	return s.atomicJSON("terms-acceptance.pending.json", acceptance)
}

func (s Store) ClearPendingTermsAcceptance() error {
	err := os.Remove(filepath.Join(s.Root, "terms-acceptance.pending.json"))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

func (s Store) loadTermsFile(name string) (TermsAcceptance, error) {
	data, err := os.ReadFile(filepath.Join(s.Root, name))
	if errors.Is(err, os.ErrNotExist) {
		return TermsAcceptance{}, ErrNotConfigured
	}
	if err != nil {
		return TermsAcceptance{}, fmt.Errorf("read %s: %w", name, err)
	}
	var acceptance TermsAcceptance
	if err := json.Unmarshal(data, &acceptance); err != nil {
		return TermsAcceptance{}, fmt.Errorf("parse %s: %w", name, err)
	}
	return acceptance, nil
}

func (s Store) loadSecurityMetadata() (securityMetadata, error) {
	data, err := os.ReadFile(filepath.Join(s.Root, "security.json"))
	if errors.Is(err, os.ErrNotExist) {
		return securityMetadata{}, nil
	}
	if err != nil {
		return securityMetadata{}, fmt.Errorf("read security metadata: %w", err)
	}
	var metadata securityMetadata
	if err := json.Unmarshal(data, &metadata); err != nil {
		return securityMetadata{}, fmt.Errorf("parse security metadata: %w", err)
	}
	return metadata, nil
}

func (s Store) saveSecurityMetadata(metadata securityMetadata) error {
	if err := s.Ensure(); err != nil {
		return err
	}
	return s.atomicJSON("security.json", metadata)
}

func (s Store) atomicJSON(name string, value any) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Errorf("encode %s: %w", name, err)
	}
	return s.atomicText(name, string(data))
}

func (s Store) atomicText(name, value string) error {
	tmp := filepath.Join(s.Root, "."+name+".tmp")
	if err := os.WriteFile(tmp, []byte(value), 0o600); err != nil {
		return fmt.Errorf("write %s: %w", name, err)
	}
	if err := replaceFile(tmp, filepath.Join(s.Root, name)); err != nil {
		return fmt.Errorf("replace %s: %w", name, err)
	}
	return nil
}

func replaceFile(source, destination string) error {
	if err := os.Remove(destination); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return os.Rename(source, destination)
}

func samePath(left, right string) bool {
	a, errA := filepath.Abs(left)
	b, errB := filepath.Abs(right)
	return errA == nil && errB == nil && strings.EqualFold(filepath.Clean(a), filepath.Clean(b))
}
