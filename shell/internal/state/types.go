package state

import (
	"fmt"
	"net/url"
	"strings"
	"time"
)

const ProtocolVersion = 1

const (
	DefaultCacheMaxAgeSeconds  = int64(72 * 60 * 60)
	DefaultOfflineGraceSeconds = int64(14 * 24 * 60 * 60)
	CacheFresh                 = "fresh"
	CacheGrace                 = "grace"
	CacheExpired               = "expired"
	CachePackaged              = "packaged"
	CacheUnavailable           = "unavailable"
)

type SignedPolicy struct {
	IssuedAt             int64  `json:"iat,omitempty"`
	ExpiresAt            int64  `json:"exp,omitempty"`
	CacheMaxAgeSeconds   int64  `json:"cacheMaxAgeSeconds,omitempty"`
	OfflineGraceSeconds  int64  `json:"offlineGraceSeconds,omitempty"`
	RequiredTermsVersion string `json:"requiredTermsVersion,omitempty"`
	TermsURL             string `json:"termsUrl,omitempty"`
	PrivacyURL           string `json:"privacyUrl,omitempty"`
}

func (p SignedPolicy) WithDefaults(reference time.Time) SignedPolicy {
	if p.CacheMaxAgeSeconds <= 0 {
		p.CacheMaxAgeSeconds = DefaultCacheMaxAgeSeconds
	}
	if p.OfflineGraceSeconds <= 0 {
		p.OfflineGraceSeconds = DefaultOfflineGraceSeconds
	}
	if p.IssuedAt <= 0 {
		p.IssuedAt = reference.Unix()
	}
	if p.ExpiresAt <= 0 {
		p.ExpiresAt = p.IssuedAt + p.CacheMaxAgeSeconds + p.OfflineGraceSeconds
	}
	return p
}

func (p SignedPolicy) Validate(reference time.Time) error {
	p = p.WithDefaults(reference)
	if p.IssuedAt <= 0 || p.ExpiresAt <= p.IssuedAt {
		return fmt.Errorf("invalid signed policy timestamps")
	}
	for name, raw := range map[string]string{"termsUrl": p.TermsURL, "privacyUrl": p.PrivacyURL} {
		if raw == "" {
			continue
		}
		u, err := url.Parse(raw)
		if err != nil || !strings.EqualFold(u.Scheme, "https") || u.Host == "" {
			return fmt.Errorf("%s must be an https URL", name)
		}
	}
	return nil
}

func (p SignedPolicy) CacheDisposition(now, lastSeen time.Time) string {
	p = p.WithDefaults(now)
	effectiveNow := now
	if lastSeen.After(effectiveNow) {
		effectiveNow = lastSeen
	}
	age := effectiveNow.Unix() - p.IssuedAt
	if age < 0 {
		age = 0
	}
	if age <= p.CacheMaxAgeSeconds {
		return CacheFresh
	}
	if age <= p.CacheMaxAgeSeconds+p.OfflineGraceSeconds && effectiveNow.Unix() <= p.ExpiresAt {
		return CacheGrace
	}
	return CacheExpired
}

type Config struct {
	WorkerBaseURL string `json:"worker_base_url"`
	InstallID     string `json:"install_id"`
	Token         string `json:"-"`
	SIDCTarget    string `json:"sidc_target"`
	EquipmentName string `json:"equipment_name"`
	ContactName   string `json:"contact_name"`
	TicketURL     string `json:"ticket_url"`
	Protocol      int    `json:"protocol_version"`
}

type Notice struct {
	ID               string `json:"id"`
	Severity         string `json:"severity"`
	Frequency        string `json:"frequency"`
	Title            string `json:"title"`
	Message          string `json:"message"`
	Closable         bool   `json:"closable"`
	RequiresConsent  bool   `json:"requires_consent"`
	CountdownSeconds int    `json:"countdown_seconds"`
}

type Contact struct {
	Name      string `json:"name"`
	TicketURL string `json:"ticket_url"`
}

type State struct {
	InstallID     string
	ServerTime    time.Time
	CacheUntil    time.Time
	Contact       Contact
	Notices       []Notice
	Config        *ShellConfig
	Policy        SignedPolicy
	CacheState    string
	Cached        bool
	SetupRequired bool
	Failure       string
}

func (s State) RequiresConsent() bool {
	for _, notice := range s.Notices {
		if notice.RequiresConsent {
			return true
		}
	}
	return false
}

func (s State) ExpiredNotice() (Notice, bool) {
	for _, notice := range s.Notices {
		if notice.RequiresConsent {
			return notice, true
		}
	}
	return Notice{}, false
}

type Event struct {
	ProtocolVersion int    `json:"protocol_version"`
	OpenID          string `json:"open_id"`
	Type            string `json:"type"`
	EquipmentName   string `json:"equipment_name,omitempty"`
	ShellVersion    string `json:"shell_version,omitempty"`
	SIDCVersion     string `json:"sidc_version,omitempty"`
	ConsentState    string `json:"consent_state,omitempty"`
	LaunchResult    string `json:"launch_result,omitempty"`
}

type TermsAcceptance struct {
	TermsVersion string `json:"termsVersion"`
	TermsSha256  string `json:"termsSha256"`
	AcceptedAt   string `json:"acceptedAt"`
	Method       string `json:"method"`
	ShellVersion string `json:"shellVersion,omitempty"`
}

func (a TermsAcceptance) ValidFor(version, sha256 string, now time.Time) bool {
	if version == "" || !strings.EqualFold(a.TermsVersion, version) || !strings.EqualFold(a.TermsSha256, sha256) {
		return false
	}
	if a.Method != "installer" && a.Method != "first-run" && a.Method != "reacceptance" {
		return false
	}
	acceptedAt, err := time.Parse(time.RFC3339, a.AcceptedAt)
	return err == nil && !acceptedAt.After(now.Add(5*time.Minute))
}

type EnrollmentResponse struct {
	InstallID         string `json:"install_id"`
	InstallationToken string `json:"installation_token"`
	ShellConfig       struct {
		WorkerBaseURL string `json:"worker_base_url"`
		SIDCTarget    string `json:"sidc_target"`
		EquipmentName string `json:"equipment_name"`
		ContactName   string `json:"contact_name"`
		TicketURL     string `json:"ticket_url"`
		Protocol      int    `json:"protocol_version"`
	} `json:"shell_config"`
}

type stateEnvelope struct {
	StateToken string `json:"state_token"`
}
