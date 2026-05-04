import { useEffect, useState } from 'react';
import { useSolixStore } from '../store/index.js';

interface SkillDetail {
  id: string;
  name: string;
  description: string;
  source: 'anthropic' | 'solix' | 'user';
  manifestPath: string;
  installedInProjects: string[];
  manifest: string;
}

export function SkillPanel(): JSX.Element | null {
  const skillId = useSolixStore((s) => s.selectedSkillId);
  const skillSummary = useSolixStore((s) =>
    skillId ? s.skills[skillId] : null,
  );
  const select = useSolixStore((s) => s.selectSkill);
  const advisors = useSolixStore((s) => s.advisors);

  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!skillId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/skills/${encodeURIComponent(skillId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: SkillDetail | null) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [skillId]);

  if (!skillSummary) return null;

  const requiredBy = Object.values(advisors).filter((a) =>
    a.requiredSkills.some((rs) => skillSummary.id.endsWith(`:${rs}`) || skillSummary.id === rs),
  );

  return (
    <div className="absolute top-0 right-0 h-full w-[480px] bg-solix-panel border-l border-solix-border backdrop-blur-md flex flex-col z-20">
      <div className="px-4 py-3 border-b border-solix-border flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-cyan-300/70">
            Skill · {skillSummary.source}
          </div>
          <div className="text-lg font-semibold">{skillSummary.name}</div>
          <div className="text-xs text-slate-400 mt-0.5 break-all">
            {skillSummary.id}
          </div>
        </div>
        <button
          onClick={() => select(null)}
          className="text-slate-400 hover:text-slate-100"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {requiredBy.length > 0 && (
        <div className="px-4 py-2 border-b border-solix-border">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
            required by
          </div>
          <div className="flex flex-wrap gap-1.5">
            {requiredBy.map((a) => (
              <span
                key={a.id}
                className="text-[10px] px-1.5 py-0.5 rounded border border-amber-300/40 text-amber-200"
              >
                <span className="mr-1">{a.glyph}</span>
                {a.codename}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 py-3 border-b border-solix-border text-sm text-slate-300 leading-relaxed">
        {skillSummary.description}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2">
          manifest
        </div>
        {loading && (
          <div className="text-sm text-slate-500 italic">Loading…</div>
        )}
        {detail && (
          <pre className="text-[11px] text-slate-300 whitespace-pre-wrap break-words bg-black/40 p-3 rounded border border-solix-border">
            {detail.manifest}
          </pre>
        )}
      </div>

      <div className="px-4 py-3 border-t border-solix-border text-xs text-slate-500">
        {skillSummary.installedInProjects.length === 0
          ? 'Not installed in any project yet.'
          : `Installed in ${skillSummary.installedInProjects.length} project(s).`}
      </div>
    </div>
  );
}
