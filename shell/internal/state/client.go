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

type StateLogger interface {
	Printf(format string, v ...any)
}

type Client struct {
	HTTP             *http.Client
	Store            Store
	Verifier         Verifier
	Timeout          time.Duration
	AllowUnsignedDev bool
}

func NewClient(store Store, verifier Verifier) Client {
	return Client{
		HTTP:     &http.Client{Timeout: 3 * time.Second},
		Store:    store,
		Verifier: verifier,
		Timeout:  3 * time.Second,
	}
}

func NewClientWithOptions(store Store, verifier Verifier, allowUnsignedDev bool) Client {
	client := NewClient(store, verifier)
	client.AllowUnsignedDev = allowUnsignedDev
	return client
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

func (c Client) FetchShellConfig(ctx context.Context, config Config, cachedRevision string) (ShellConfig, bool, error) {
	headers := map[string]string{}
	if cachedRevision != "" {
		headers["If-None-Match"] = fmt.Sprintf("\"%s\"", cachedRevision)
	}
	url := strings.TrimRight(config.WorkerBaseURL, "/") + "/api/v1/shell/config"
	body, statusCode, _, err := c.doRequest(ctx, http.MethodGet, url, "Bearer "+config.Token, nil, headers)
	if err != nil {
		return ShellConfig{}, false, err
	}
	if statusCode == http.StatusNotModified {
		return ShellConfig{}, false, nil
	}
	if statusCode != http.StatusOK {
		return ShellConfig{}, false, fmt.Errorf("worker returned HTTP %d", statusCode)
	}

	var envelope ShellConfigEnvelope
	if err := json.Unmarshal(body, &envelope); err != nil {
		return ShellConfig{}, false, fmt.Errorf("decode shell config: %w", err)
	}
	if envelope.ConfigToken == "" {
		return ShellConfig{}, false, fmt.Errorf("signed shell config token is missing")
	}
	var signed State
	var verifyErr error
	if c.AllowUnsignedDev {
		signed, verifyErr = c.Verifier.ParseUnsignedDev(envelope.ConfigToken, config.InstallID)
	} else {
		signed, verifyErr = c.Verifier.Parse(envelope.ConfigToken, config.InstallID)
	}
	if verifyErr != nil {
		return ShellConfig{}, false, fmt.Errorf("verify config token: %w", verifyErr)
	}
	if signed.Config == nil {
		return ShellConfig{}, false, fmt.Errorf("signed shell config is missing")
	}
	cfg := *signed.Config
	cfg.Policy = signed.Policy
	if err := cfg.Validate(config.InstallID); err != nil {
		return ShellConfig{}, false, fmt.Errorf("invalid shell config: %w", err)
	}
	return cfg, true, nil
}

func (c Client) ResolveEffectiveConfig(ctx context.Context, config Config, shellVersion, sidcVersion string, logger StateLogger) (ShellConfig, bool) {
	now := c.Store.EffectiveNow(time.Now().UTC())
	cached, cacheErr := c.Store.LoadShellConfig()
	cachedRevision := ""
	hasCache := cacheErr == nil && cached.Validate(config.InstallID) == nil
	if hasCache {
		cached.Policy = cached.Policy.WithDefaults(configTime(cached, now))
		cached.CacheState = cached.Policy.CacheDisposition(now, now)
		cachedRevision = cached.Revision
	}

	if logger != nil {
		logger.Printf("config sync started")
	}

	fetched, modified, err := c.FetchShellConfig(ctx, config, cachedRevision)
	if err == nil {
		if modified {
			fetched.CacheState = fetched.Policy.CacheDisposition(now, now)
			if fetched.CacheState == CacheExpired {
				return c.expiredConfig(config, shellVersion, sidcVersion, logger), true
			}
			if acceptErr := c.Store.AcceptPolicy("config", fetched.Policy, configTime(fetched, now)); acceptErr != nil {
				if logger != nil {
					logger.Printf("config rejected: %v", acceptErr)
				}
				return c.cachedOrUnavailable(config, shellVersion, sidcVersion, cached, hasCache, now, logger)
			}
			if saveErr := c.Store.SaveShellConfig(fetched); saveErr != nil && logger != nil {
				logger.Printf("failed to save shell config cache: %v", saveErr)
			}
			if logger != nil {
				logger.Printf("config updated (revision: %s, status: %s)", fetched.Revision, fetched.Installation.Status)
			}
			return fetched, false
		}
		if hasCache {
			cached.CacheState = cached.Policy.CacheDisposition(now, now)
			if logger != nil {
				logger.Printf("config not modified")
			}
			if cached.CacheState == CacheExpired {
				return c.expiredConfig(config, shellVersion, sidcVersion, logger), true
			}
			return cached, false
		}
	} else if logger != nil {
		logger.Printf("invalid configuration rejected or sync failed: %v", err)
	}

	if hasCache {
		cached.CacheState = cached.Policy.CacheDisposition(now, now)
		if cached.CacheState == CacheExpired {
			return c.expiredConfig(config, shellVersion, sidcVersion, logger), true
		}
		if logger != nil {
			logger.Printf("offline fallback: using cached configuration (status: %s)", cached.Installation.Status)
		}
		return cached, true
	}
	if c.Store.HasSuccessfulConfigSync() {
		return c.expiredConfig(config, shellVersion, sidcVersion, logger), true
	}

	fallback := DefaultShellConfig(config, shellVersion, sidcVersion)
	if logger != nil {
		logger.Printf("cache fallback: using packaged defaults (status: %s)", fallback.Installation.Status)
	}
	return fallback, true
}

func (c Client) cachedOrUnavailable(config Config, shellVersion, sidcVersion string, cached ShellConfig, hasCache bool, now time.Time, logger StateLogger) (ShellConfig, bool) {
	if hasCache {
		cached.CacheState = cached.Policy.CacheDisposition(now, now)
		if cached.CacheState == CacheExpired {
			return c.expiredConfig(config, shellVersion, sidcVersion, logger), true
		}
		return cached, true
	}
	return c.expiredConfig(config, shellVersion, sidcVersion, logger), true
}

func (c Client) expiredConfig(config Config, shellVersion, sidcVersion string, logger StateLogger) ShellConfig {
	if logger != nil {
		logger.Printf("configuration cache is outside its offline grace period")
	}
	return UnavailableShellConfig(config, shellVersion, sidcVersion, "La configuración guardada venció. Contactá a soporte para sincronizar AegisDesk.")
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
			var online State
			var verifyErr error
			if c.AllowUnsignedDev {
				online, verifyErr = c.Verifier.ParseUnsignedDev(envelope.StateToken, config.InstallID)
			} else {
				online, verifyErr = c.Verifier.Parse(envelope.StateToken, config.InstallID)
			}
			if verifyErr == nil {
				online.CacheState = online.Policy.CacheDisposition(time.Now().UTC(), c.Store.EffectiveNow(time.Now().UTC()))
				if online.CacheState == CacheExpired || c.Store.IsPolicyRollback("state", online.Policy.IssuedAt) {
					verifyErr = fmt.Errorf("state token is expired or older than the last accepted token")
				} else if acceptErr := c.Store.AcceptPolicy("state", online.Policy, online.ServerTime); acceptErr != nil {
					verifyErr = acceptErr
				}
			}
			if verifyErr == nil {
				if saveErr := c.Store.SaveCache(envelope.StateToken); saveErr != nil {
					state.Failure = saveErr.Error()
				}
				if online.Config != nil {
					online.Config.Policy = online.Policy
					_ = c.Store.SaveShellConfig(*online.Config)
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
		var cached State
		var verifyErr error
		if c.AllowUnsignedDev {
			cached, verifyErr = c.Verifier.ParseUnsignedDev(cachedToken, config.InstallID)
		} else {
			cached, verifyErr = c.Verifier.Parse(cachedToken, config.InstallID)
		}
		if verifyErr == nil && !c.Store.IsPolicyRollback("state", cached.Policy.IssuedAt) {
			cached.CacheState = cached.Policy.CacheDisposition(time.Now().UTC(), c.Store.EffectiveNow(time.Now().UTC()))
			if cached.CacheState != CacheExpired {
				cached.Cached = true
				cached.Failure = state.Failure
				if cached.Config == nil {
					if cfg, err := c.Store.LoadShellConfig(); err == nil {
						cached.Config = &cfg
					}
				}
				return cached
			}
		}
	}
	return state
}

func configTime(config ShellConfig, fallback time.Time) time.Time {
	if parsed, err := time.Parse(time.RFC3339, config.GeneratedAt); err == nil {
		return parsed
	}
	return fallback
}

func (c Client) SendTermsAcceptance(ctx context.Context, config Config, acceptance TermsAcceptance) error {
	body, err := json.Marshal(acceptance)
	if err != nil {
		return fmt.Errorf("encode terms acceptance: %w", err)
	}
	_, statusCode, _, err := c.doRequest(ctx, http.MethodPost, strings.TrimRight(config.WorkerBaseURL, "/")+"/api/shell/terms-acceptance", "Bearer "+config.Token, body, nil)
	if err != nil {
		return err
	}
	if statusCode < 200 || statusCode >= 300 {
		return fmt.Errorf("terms acceptance returned HTTP %d", statusCode)
	}
	return nil
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
	data, statusCode, _, err := c.doRequest(ctx, method, url, authorization, body, nil)
	if err != nil {
		return nil, err
	}
	if statusCode < 200 || statusCode >= 300 {
		return nil, fmt.Errorf("worker returned HTTP %d", statusCode)
	}
	return data, nil
}

func (c Client) doRequest(ctx context.Context, method, url, authorization string, body []byte, headers map[string]string) ([]byte, int, http.Header, error) {
	timeout := c.Timeout
	if timeout <= 0 {
		timeout = 3 * time.Second
	}
	requestContext, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	request, err := http.NewRequestWithContext(requestContext, method, url, reader)
	if err != nil {
		return nil, 0, nil, fmt.Errorf("build request: %w", err)
	}
	request.Header.Set("Authorization", authorization)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")
	for k, v := range headers {
		request.Header.Set(k, v)
	}
	response, err := c.HTTP.Do(request)
	if err != nil {
		return nil, 0, nil, fmt.Errorf("worker request: %w", err)
	}
	defer response.Body.Close()
	limited := io.LimitReader(response.Body, 256*1024)
	data, err := io.ReadAll(limited)
	if err != nil {
		return nil, response.StatusCode, response.Header, fmt.Errorf("read worker response: %w", err)
	}
	return data, response.StatusCode, response.Header, nil
}
