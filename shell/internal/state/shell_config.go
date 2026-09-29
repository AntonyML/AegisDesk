package state

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

var (
	ErrInvalidSchemaVersion = errors.New("unsupported configuration schema version")
	ErrInvalidStatus        = errors.New("invalid installation status")
	ErrMissingInstallation  = errors.New("missing installation configuration")
)

// Strongly-typed remote configuration matching worker/src/contracts/shell-config.ts
type ShellConfig struct {
	SchemaVersion int                `json:"schema_version"`
	Revision      string             `json:"revision"`
	GeneratedAt   string             `json:"generated_at"`
	Installation  InstallationConfig `json:"installation"`
	Support       SupportConfig      `json:"support"`
	Policy        SignedPolicy       `json:"policy,omitempty"`
	CacheState    string             `json:"-"`
}

type InstallationConfig struct {
	ID             string            `json:"id"`
	Status         string            `json:"status"` // "active", "disabled", "revoked"
	CycleExpiresAt *string           `json:"cycle_expires_at"`
	Device         DeviceInfo        `json:"device"`
	Organization   *OrganizationInfo `json:"organization"`
	Group          *GroupInfo        `json:"group"`
	User           *AssignedUserInfo `json:"user"`
}

type DeviceInfo struct {
	Name         string  `json:"name"`
	ShellVersion string  `json:"shell_version"`
	SIDCVersion  string  `json:"sidc_version"`
	LastOpenedAt *string `json:"last_opened_at"`
}

type OrganizationInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type GroupInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type AssignedUserInfo struct {
	ID          string `json:"id"`
	DisplayName string `json:"display_name"`
}

type SupportConfig struct {
	Title     string           `json:"title"`
	Message   string           `json:"message"`
	Notice    string           `json:"notice"`
	AreaName  string           `json:"area_name"`
	Hours     string           `json:"hours"`
	Contacts  []SupportContact `json:"contacts"`
	Links     []SupportLink    `json:"links"`
	UpdatedAt string           `json:"updated_at"`
}

type SupportContact struct {
	Type  string `json:"type"` // "email", "phone"
	Label string `json:"label"`
	Value string `json:"value"`
}

type SupportLink struct {
	Label string `json:"label"`
	URL   string `json:"url"`
}

type ShellConfigEnvelope struct {
	Config      ShellConfig `json:"config"`
	ConfigToken string      `json:"config_token"`
}

// Validate checks the essential fields and schema compatibility of the configuration.
func (c *ShellConfig) Validate(expectedInstallID string) error {
	if c.SchemaVersion != 1 {
		return fmt.Errorf("%w: %d (expected 1)", ErrInvalidSchemaVersion, c.SchemaVersion)
	}
	if c.Installation.ID == "" {
		return ErrMissingInstallation
	}
	if expectedInstallID != "" && !strings.EqualFold(c.Installation.ID, expectedInstallID) {
		return fmt.Errorf("installation ID mismatch: got %q, expected %q", c.Installation.ID, expectedInstallID)
	}
	switch c.Installation.Status {
	case "active", "disabled", "revoked":
		// Valid status
	default:
		return fmt.Errorf("%w: %q", ErrInvalidStatus, c.Installation.Status)
	}
	return nil
}

// DefaultShellConfig creates a safe, offline-ready fallback configuration.
func DefaultShellConfig(config Config, shellVersion, sidcVersion string) ShellConfig {
	now := time.Now().UTC().Format(time.RFC3339)
	contactName := config.ContactName
	if contactName == "" {
		contactName = "Soporte Aegis"
	}
	ticketURL := config.TicketURL
	if ticketURL == "" {
		ticketURL = "https://aegisdesk.tonyml.com/tickets"
	}

	links := []SupportLink{}
	if ticketURL != "" {
		links = append(links, SupportLink{Label: "Abrir ticket", URL: ticketURL})
	}

	return ShellConfig{
		SchemaVersion: 1,
		Revision:      "default-fallback",
		GeneratedAt:   now,
		Installation: InstallationConfig{
			ID:     config.InstallID,
			Status: "active",
			Device: DeviceInfo{
				Name:         config.EquipmentName,
				ShellVersion: shellVersion,
				SIDCVersion:  sidcVersion,
			},
		},
		Support: SupportConfig{
			Title:     "AegisDesk",
			Message:   "¿Necesitás ayuda con SIDC?",
			AreaName:  contactName,
			Links:     links,
			UpdatedAt: now,
		},
		Policy: SignedPolicy{
			RequiredTermsVersion: "0.1.0-draft",
		},
		CacheState: CachePackaged,
	}
}

func UnavailableShellConfig(config Config, shellVersion, sidcVersion, reason string) ShellConfig {
	result := DefaultShellConfig(config, shellVersion, sidcVersion)
	result.Revision = "unavailable"
	result.Installation.Status = "disabled"
	result.CacheState = CacheUnavailable
	result.Support.Message = reason
	return result
}
