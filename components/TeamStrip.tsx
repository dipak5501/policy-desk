"use client";

const TEAM = [
  { github: "dipak5501", name: "Dipak Yadav", role: "Owner" },
  { github: "ubiiii", name: "Utkarsh Lubal", role: "Collaborator" },
  { github: "KashifManzer", name: "Kashif Manzer", role: "Collaborator" },
] as const;

export function TeamStrip() {
  return (
    <section className="team-strip" aria-label="Team">
      <p className="team-label">Team</p>
      <ul className="team-list">
        {TEAM.map((m) => (
          <li key={m.github}>
            <a
              href={`https://github.com/${m.github}`}
              target="_blank"
              rel="noreferrer"
            >
              @{m.github}
            </a>
            <span>
              {m.name} · {m.role}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
