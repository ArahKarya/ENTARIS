import { IMPACT_IS_PLACEHOLDER, QUOTES, STORIES } from "./impactContent";

const initials = (name: string): string =>
  name
    .replace(/^(PT|CV)\s+/i, "")
    .split(/\s+/)
    .filter((word) => /^[A-Za-z]/.test(word))
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");

/** #pengguna: logo row plus one result card per company. */
export function ImpactCompanies() {
  return (
    <section id="pengguna" className="role-section role-section--quiet imp-section">
      <header className="role-intro">
        <p className="role-kicker">{IMPACT_IS_PLACEHOLDER ? "Contoh pengguna" : "Mereka yang memakai Entaris"}</p>
        <h2>{IMPACT_IS_PLACEHOLDER ? "Seperti ini cerita pengguna akan tampil." : "Mereka sudah memakai Entaris."}</h2>
      </header>
      <ul className="imp-logos" aria-label="Perusahaan pengguna Entaris">
        {STORIES.map((story) => (
          <li key={story.company} className="imp-logos__item">
            <span className="imp-logos__mark" aria-hidden="true">
              {initials(story.company)}
            </span>
            <span className="imp-logos__name">{story.company.replace(/^(PT|CV)\s+/i, "")}</span>
          </li>
        ))}
      </ul>
      <div className="imp-stories">
        {STORIES.map((story) => (
          <article key={story.company} className="imp-story" data-observe="reveal-up">
            <p className="imp-story__industry">{story.industry}</p>
            <h3 className="imp-story__company">{story.company}</h3>
            <p className="imp-story__result">{story.result}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

/** #apa-kata-mereka: quote cards. */
export function ImpactQuotes() {
  return (
    <section id="apa-kata-mereka" className="role-section imp-section">
      <header className="role-intro">
        <h2>{IMPACT_IS_PLACEHOLDER ? "Contoh kutipan pengguna." : "Apa kata mereka."}</h2>
      </header>
      <div className="imp-quotes">
        {QUOTES.map((quote) => (
          <figure key={quote.name} className="imp-quote" data-observe="reveal-up">
            <blockquote>
              <p>“{quote.text}”</p>
            </blockquote>
            <figcaption>
              <strong>{quote.name}</strong>
              <span>{quote.role}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
