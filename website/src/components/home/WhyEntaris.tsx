import { Icon } from "./HomeIcons";
import { SectionEyebrow } from "./SectionEyebrow";
import { FIT_ITEMS, WHY_ROWS } from "./homeContent";

const pad = (n: number): string => String(n).padStart(2, "0");

/** #kenapa-entaris: problem and solution rows from the product README. */
export function WhySection() {
  return (
    <section id="kenapa-entaris" className="home-why" aria-labelledby="kenapa-heading">
      <div className="home-section-head">
        <SectionEyebrow name="Kenapa Entaris" context="Masalah dan solusinya" />
        <h2 id="kenapa-heading" className="home-section-title">
          Mudah dipasang, cepat dipakai, kuat untuk bertumbuh
        </h2>
      </div>
      <div className="home-why__table">
        <div className="home-why__row home-why__row--head" aria-hidden="true">
          <span className="home-why__num">
            #
          </span>
          <span>Masalah</span>
          <span>Solusi Entaris</span>
        </div>
        {WHY_ROWS.map((row, i) => (
          <div key={row.problem} className="home-why__row">
            <span className="home-why__num">
              {pad(i + 1)}
            </span>
            <h3 className="home-why__problem">
              {row.problem}
            </h3>
            <p className="home-why__solution">
              {row.solution}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** #cocok-untuk: who Entaris is built for. */
export function FitSection() {
  return (
    <section id="cocok-untuk" className="home-fit" aria-labelledby="cocok-heading">
      <div className="home-section-head">
        <SectionEyebrow name="Cocok untuk" context="Dari toko hingga pabrik" />
        <h2 id="cocok-heading" className="home-section-title">
          Siapa yang memakai Entaris
        </h2>
      </div>
      <ul className="home-fit__grid">
        {FIT_ITEMS.map((item, i) => (
          <li key={item.title} className="home-fit__item">
            <span className="home-fit__num">{pad(i + 1)}</span>
            <h3 className="home-fit__title">
              <Icon name="check" className="home-fit__icon" />
              {item.title}
            </h3>
            <p className="home-fit__body">{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
