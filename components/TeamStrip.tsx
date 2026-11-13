"use client";

const TEAM = [
  {
    github: "dipak5501",
    name: "Dipak Yadav",
    role: "Full-stack developer · product/engineering lead",
  },
  {
    github: "ubiiii",
    name: "Utkarsh Lubal",
    role: "Cybersecurity engineer",
  },
  {
    github: "KashifManzer",
    name: "Kashif Manzer",
    role: "Blockchain engineer",
  },
] as const;

export function TeamStrip() {
  return (
    <section className="team-strip" aria-label="Team">
      <p className="team-label">Engineering</p>
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
