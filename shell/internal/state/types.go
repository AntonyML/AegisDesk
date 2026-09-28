package state

import "time"

const ProtocolVersion = 1

type Config struct {
	WorkerBaseURL string `json:"worker_base_url"`
	InstallID     string `json:"install_id"`
	Token         string `json:"installation_token"`
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
	WindowsUser     string `json:"windows_user,omitempty"`
	EquipmentName   string `json:"equipment_name,omitempty"`
	ShellVersion    string `json:"shell_version,omitempty"`
	SIDCVersion     string `json:"sidc_version,omitempty"`
	ConsentState    string `json:"consent_state,omitempty"`
	LaunchResult    string `json:"launch_result,omitempty"`
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
