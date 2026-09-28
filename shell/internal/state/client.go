package state

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	HTTP     *http.Client
	Store    Store
	Verifier Verifier
	Timeout  time.Duration
}

func NewClient(store Store, verifier Verifier) Client {
	return Client{
		HTTP:     &http.Client{Timeout: 3 * time.Second},
		Store:    store,
		Verifier: verifier,
		Timeout:  3 * time.Second,
	}
}

func (c Client) Enroll(ctx context.Context, baseURL, code string, request map[string]any) (Config, error) {
	body, err := json.Marshal(request)
	if err != nil {
		return Config{}, fmt.Errorf("encode enrollment: %w", err)
	}
	response, err := c.do(ctx, http.MethodPost, strings.TrimRight(baseURL, "/")+"/api/v1/shell/enroll", "Enrollment "+code, body)
	if err != nil {
		return Config{}, err
	}
	var payload EnrollmentResponse
	if err := json.Unmarshal(response, &payload); err != nil {
		return Config{}, fmt.Errorf("decode enrollment: %w", err)
	}
	if payload.InstallID == "" || payload.InstallationToken == "" || payload.ShellConfig.WorkerBaseURL == "" {
		return Config{}, fmt.Errorf("enrollment response is incomplete")
	}
	return Config{
		WorkerBaseURL: payload.ShellConfig.WorkerBaseURL,
		InstallID:     payload.InstallID,
		Token:         payload.InstallationToken,
		SIDCTarget:    payload.ShellConfig.SIDCTarget,
		EquipmentName: payload.ShellConfig.EquipmentName,
		ContactName:   payload.ShellConfig.ContactName,
		TicketURL:     payload.ShellConfig.TicketURL,
		Protocol:      payload.ShellConfig.Protocol,
	}, nil
}

func (c Client) Resolve(ctx context.Context, config Config, openID, shellVersion, sidcVersion string) State {
	state := State{InstallID: config.InstallID, Contact: Contact{Name: config.ContactName, TicketURL: config.TicketURL}}
	request := map[string]any{
		"protocol_version": ProtocolVersion,
		"install_id":       config.InstallID,
		"open_id":          openID,
		"shell_version":    shellVersion,
		"sidc_version":     sidcVersion,
	}
	body, _ := json.Marshal(request)
	response, err := c.do(ctx, http.MethodPost, strings.TrimRight(config.WorkerBaseURL, "/")+"/api/v1/shell/state", "Bearer "+config.Token, body)
	if err == nil {
		var envelope stateEnvelope
		if decodeErr := json.Unmarshal(response, &envelope); decodeErr == nil {
			if online, verifyErr := c.Verifier.Parse(envelope.StateToken, config.InstallID); verifyErr == nil {
				if saveErr := c.Store.SaveCache(envelope.StateToken); saveErr != nil {
					state.Failure = saveErr.Error()
				}
				return online
			} else {
				state.Failure = verifyErr.Error()
			}
		} else {
			state.Failure = decodeErr.Error()
		}
	} else {
		state.Failure = err.Error()
	}

	if cachedToken, cacheErr := c.Store.LoadCache(); cacheErr == nil {
		if cached, verifyErr := c.Verifier.Parse(cachedToken, config.InstallID); verifyErr == nil {
			cached.Cached = true
			cached.Failure = state.Failure
			return cached
		}
	}
	return state
}

func (c Client) SendEvent(ctx context.Context, config Config, event Event) error {
	body, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("encode event: %w", err)
	}
	_, err = c.do(ctx, http.MethodPost, strings.TrimRight(config.WorkerBaseURL, "/")+"/api/v1/shell/events", "Bearer "+config.Token, body)
	return err
}

func (c Client) do(ctx context.Context, method, url, authorization string, body []byte) ([]byte, error) {
	timeout := c.Timeout
	if timeout <= 0 {
		timeout = 3 * time.Second
	}
	requestContext, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	request, err := http.NewRequestWithContext(requestContext, method, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	request.Header.Set("Authorization", authorization)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")
	response, err := c.HTTP.Do(request)
	if err != nil {
		return nil, fmt.Errorf("worker request: %w", err)
	}
	defer response.Body.Close()
	limited := io.LimitReader(response.Body, 256*1024)
	data, err := io.ReadAll(limited)
	if err != nil {
		return nil, fmt.Errorf("read worker response: %w", err)
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, fmt.Errorf("worker returned HTTP %d", response.StatusCode)
	}
	return data, nil
}
