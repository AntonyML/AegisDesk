package ui

import (
	"bytes"
	"context"
	"encoding/binary"
	"testing"
	"time"

	"aegisdesk-shell/internal/assets"
	"aegisdesk-shell/internal/state"
)

func TestShellIconICOIntegrity(t *testing.T) {
	if len(assets.ShellIconICO) < 6 {
		t.Fatal("embedded icon is too small")
	}

	reader := bytes.NewReader(assets.ShellIconICO)
	var reserved, icoType, count uint16
	_ = binary.Read(reader, binary.LittleEndian, &reserved)
	_ = binary.Read(reader, binary.LittleEndian, &icoType)
	_ = binary.Read(reader, binary.LittleEndian, &count)

	if reserved != 0 || icoType != 1 {
		t.Fatalf("invalid ICO header: reserved=%d, type=%d", reserved, icoType)
	}

	if count < 7 {
		t.Fatalf("expected at least 7 resolutions in multi-size ICO, got %d", count)
	}

	found256 := false
	found16 := false
	for i := 0; i < int(count); i++ {
		var w, h, colors, res uint8
		var planes, bpp uint16
		var size, offset uint32
		_ = binary.Read(reader, binary.LittleEndian, &w)
		_ = binary.Read(reader, binary.LittleEndian, &h)
		_ = binary.Read(reader, binary.LittleEndian, &colors)
		_ = binary.Read(reader, binary.LittleEndian, &res)
		_ = binary.Read(reader, binary.LittleEndian, &planes)
		_ = binary.Read(reader, binary.LittleEndian, &bpp)
		_ = binary.Read(reader, binary.LittleEndian, &size)
		_ = binary.Read(reader, binary.LittleEndian, &offset)

		width := int(w)
		if width == 0 {
			width = 256
		}
		if width == 256 {
			found256 = true
		}
		if width == 16 {
			found16 = true
		}
	}

	if !found256 || !found16 {
		t.Fatalf("expected both 16x16 and 256x256 frames in ICO (found16=%v, found256=%v)", found16, found256)
	}
}

func TestSupportOptionsEmptyFields(t *testing.T) {
	// Verify that empty or nil organization, group, user don't crash
	cfg := state.ShellConfig{
		SchemaVersion: 1,
		Installation: state.InstallationConfig{
			ID:     "inst-1",
			Status: "active",
			Device: state.DeviceInfo{Name: "PC-TEST"},
			// Organization, Group, User are nil
		},
		Support: state.SupportConfig{
			Title:   "AegisDesk",
			Message: "Help message",
			// Contacts, Links are empty
		},
	}

	opts := SupportOptions{
		Config:    cfg,
		Status:    "active",
		AutoClose: 1 * time.Millisecond,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	z := Zenity{}
	// Should run and return gracefully without panic
	z.Support(ctx, opts)
}

func TestSupportOptionsDisabled(t *testing.T) {
	org := &state.OrganizationInfo{ID: "org-1", Name: "Empresa Con Nombre Extremadamente Largo S.A."}
	grp := &state.GroupInfo{ID: "grp-1", Name: "Departamento de Tecnologías de Información y Comunicación"}
	usr := &state.AssignedUserInfo{ID: "usr-1", DisplayName: "Lic. María del Carmen Fernández de la Torre"}
	cycle := "2027-12-31T23:59:59Z"

	cfg := state.ShellConfig{
		SchemaVersion: 1,
		Installation: state.InstallationConfig{
			ID:             "inst-1",
			Status:         "disabled",
			CycleExpiresAt: &cycle,
			Device:         state.DeviceInfo{Name: "PC-ENTERPRISE-01"},
			Organization:   org,
			Group:          grp,
			User:           usr,
		},
		Support: state.SupportConfig{
			Title:    "Soporte AegisDesk",
			Message:  "El acceso a SIDC ha sido revocado administrativamente para este equipo.",
			Notice:   "Horario de atención especial de fin de año.",
			AreaName: "Mesa de Servicios TI",
			Hours:    "Lunes a Viernes, 7:30 a. m. a 4:30 p. m.",
			Contacts: []state.SupportContact{
				{Type: "email", Label: "Correo", Value: "mailto:soporte@empresa.test"},
				{Type: "phone", Label: "Teléfono", Value: "tel:+50688889999"},
			},
			Links: []state.SupportLink{
				{Label: "Abrir ticket", URL: "https://soporte.empresa.test/tickets"},
			},
		},
	}

	opts := SupportOptions{
		Config:    cfg,
		Status:    "disabled",
		AutoClose: 1 * time.Millisecond,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	z := Zenity{}
	z.Support(ctx, opts)
}
