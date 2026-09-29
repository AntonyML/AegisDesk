package ui

import (
	"context"
	"fmt"
	"time"

	"github.com/ncruces/zenity"

	"aegisdesk-shell/internal/state"
)

type SupportOptions struct {
	Config    state.ShellConfig
	Status    string // "active", "disabled", "offline", "config_error"
	IsOffline bool
	AutoClose time.Duration // e.g. 4 seconds for active startup; 0 for disabled/manual
}

type Dialogs interface {
	Contact(ctx context.Context, contact state.Contact)
	Support(ctx context.Context, opts SupportOptions)
	Notice(ctx context.Context, notice state.Notice)
	EnrollmentCode(ctx context.Context) (string, error)
	SelectSIDC(ctx context.Context) (string, error)
	Consent(ctx context.Context, notice state.Notice) bool
}

type Zenity struct{}

func (z Zenity) Support(ctx context.Context, opts SupportOptions) {
	_ = showNativeSupportDialog(ctx, opts)
}

func (z Zenity) Contact(parent context.Context, contact state.Contact) {
	cfg := state.ShellConfig{
		SchemaVersion: 1,
		Support: state.SupportConfig{
			Title:    "AegisDesk",
			Message:  "¿Necesitás ayuda con SIDC?",
			AreaName: contact.Name,
		},
	}
	if contact.TicketURL != "" {
		cfg.Support.Links = []state.SupportLink{
			{Label: "Abrir ticket", URL: contact.TicketURL},
		}
	}
	z.Support(parent, SupportOptions{
		Config:    cfg,
		Status:    "active",
		AutoClose: 4 * time.Second,
	})
}

func (Zenity) Notice(parent context.Context, notice state.Notice) {
	ctx, cancel := context.WithTimeout(parent, 10*time.Second)
	defer cancel()
	message := notice.Message
	if notice.Title != "" {
		message = notice.Title + "\n\n" + message
	}
	// Use zenity.Info with single OKLabel to eliminate duplicate Cerrar bug
	_ = zenity.Info(message,
		zenity.Title("AegisDesk · Aviso"),
		zenity.OKLabel("Cerrar"),
		zenity.Context(ctx),
		zenity.Width(460),
	)
}

func (Zenity) EnrollmentCode(ctx context.Context) (string, error) {
	return zenity.Entry("Código de enrolamiento de un solo uso:",
		zenity.Title("Configurar AegisDesk"),
		zenity.DisallowEmpty(),
		zenity.Context(ctx),
		zenity.Width(420),
	)
}

func (Zenity) SelectSIDC(ctx context.Context) (string, error) {
	return zenity.SelectFile(
		zenity.Title("Seleccioná el ejecutable de SIDC"),
		zenity.FileFilters{{Name: "Ejecutable de Windows", Patterns: []string{"*.exe"}, CaseFold: true}},
		zenity.Context(ctx),
	)
}

func (Zenity) Consent(ctx context.Context, notice state.Notice) bool {
	progress, err := zenity.Progress(
		zenity.Title("Mantenimiento requerido"),
		zenity.MaxValue(notice.CountdownSeconds),
		zenity.NoCancel(),
		zenity.Context(ctx),
	)
	if err != nil {
		return false
	}
	for remaining := notice.CountdownSeconds; remaining > 0; remaining-- {
		if progress.Text(fmt.Sprintf("%s\n\nPodés continuar bajo tu consentimiento en %d segundos.", notice.Message, remaining)) != nil {
			_ = progress.Close()
			return false
		}
		if progress.Value(notice.CountdownSeconds-remaining) != nil {
			_ = progress.Close()
			return false
		}
		select {
		case <-ctx.Done():
			_ = progress.Close()
			return false
		case <-time.After(time.Second):
		}
	}
	_ = progress.Complete()
	_ = progress.Close()
	question := fmt.Sprintf("%s\n\nAceptás continuar bajo tu consentimiento; el soporte no se hace responsable por operar sin mantenimiento.", notice.Message)
	return zenity.Question(question,
		zenity.Title("Confirmar continuidad"),
		zenity.OKLabel("Acepto"),
		zenity.CancelLabel("Cancelar"),
		zenity.NoCancel(),
		zenity.Context(ctx),
	) == nil
}
