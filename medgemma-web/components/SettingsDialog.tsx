"use client";

import { HealthInfo, Settings } from "@/lib/types";
import { clampInt } from "@/lib/utils";

interface SettingsDialogProps {
  open: boolean;
  settings: Settings;
  healthInfo: HealthInfo | null;
  onClose: () => void;
  onChange: (patch: Partial<Settings>) => void;
  onCheckNow: () => void;
}

export default function SettingsDialog({
  open,
  settings,
  healthInfo,
  onClose,
  onChange,
  onCheckNow,
}: SettingsDialogProps) {
  if (!open) return null;

  const ok = healthInfo?.ok === true;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <span>Settings</span>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label className="field-label" htmlFor="max-new-tokens">
              Max new tokens <span className="hint-inline">(1–1024, longer answers take more time)</span>
            </label>
            <div className="range-row">
              <input
                id="max-new-tokens"
                className="range"
                type="range"
                min={64}
                max={1024}
                step={64}
                value={settings.maxNewTokens}
                onChange={(event) =>
                  onChange({ maxNewTokens: clampInt(Number(event.target.value), 1, 1024, 512) })
                }
              />
              <input
                className="num-input"
                type="number"
                min={1}
                max={1024}
                value={settings.maxNewTokens}
                onChange={(event) =>
                  onChange({ maxNewTokens: clampInt(event.target.value, 1, 1024, 512) })
                }
              />
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="keepalive-seconds">
              Keepalive ping interval <span className="hint-inline">(10–300 seconds)</span>
            </label>
            <div className="range-row">
              <input
                id="keepalive-seconds"
                className="range"
                type="range"
                min={10}
                max={300}
                step={10}
                value={settings.keepAliveSeconds}
                onChange={(event) =>
                  onChange({ keepAliveSeconds: clampInt(Number(event.target.value), 10, 300, 30) })
                }
              />
              <input
                className="num-input"
                type="number"
                min={10}
                max={300}
                value={settings.keepAliveSeconds}
                onChange={(event) =>
                  onChange({ keepAliveSeconds: clampInt(event.target.value, 10, 300, 30) })
                }
              />
            </div>
          </div>

          <div className="field">
            <span className="field-label">Model API status</span>
            {ok ? (
              <div className="info-card">
                {healthInfo?.data?.model && (
                  <div className="health-row">
                    <span className="health-key">Model</span>
                    <span className="health-val">{String(healthInfo.data.model)}</span>
                  </div>
                )}
                {healthInfo?.data?.gpu && (
                  <div className="health-row">
                    <span className="health-key">GPU</span>
                    <span className="health-val">{String(healthInfo.data.gpu)}</span>
                  </div>
                )}
                {healthInfo?.data?.status && (
                  <div className="health-row">
                    <span className="health-key">Status</span>
                    <span className="health-val">{String(healthInfo.data.status)}</span>
                  </div>
                )}
                {healthInfo?.latencyMs !== undefined && (
                  <div className="health-row">
                    <span className="health-key">Last check latency</span>
                    <span className="health-val">{healthInfo.latencyMs} ms</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="info-card">
                The API could not be reached.
                {healthInfo?.error && (
                  <>
                    <br />
                    <strong>Error:</strong> {healthInfo.error}
                  </>
                )}
                {healthInfo?.detail && (
                  <>
                    <br />
                    <strong>Detail:</strong> <code>{healthInfo.detail}</code>
                  </>
                )}
              </div>
            )}
            <button type="button" className="btn btn-ghost" onClick={onCheckNow}>
              ↻ Check now
            </button>
          </div>

          <div className="info-card">
            The server reads <code>MEDGEMMA_API_URL</code> and <code>MEDGEMMA_API_KEY</code> from
            its environment (Vercel → Settings → Environment Variables). They are never sent to
            the browser. If the ngrok URL changed, update the variable and redeploy.
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
