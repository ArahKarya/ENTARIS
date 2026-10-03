import { StoryMock } from "../mock/StoryMocks";
import type { Story } from "../storyData";
import { AiraEyebrow } from "./AiraEyebrow";

/** Sticky story: copy + three numbered steps that drive `data-step` on the mockup (useAiraStories). */
export function AiraStory({ story }: { story: Story }) {
  return (
    <section id={story.sectionId} className={story.sectionClassName}>
      <div className="tacet-proto-wrap">
        <article className={`tacet-proto-story tacet-proto-story--${story.side}`} data-aira-story="" data-step="3" aria-labelledby={story.titleId}>
          <div className="tacet-proto-story__copy">
            <div className="tacet-proto-story__intro">
              <AiraEyebrow name={story.eyebrowName} context={story.eyebrowContext} />
              <h2 id={story.titleId}>{story.title}</h2>
              <p>{story.lede}</p>
            </div>
            <div className="tacet-proto-story__chapters" role="group" aria-label={`Langkah: ${story.eyebrowName}`}>
              {story.chapters.map((chapter, index) => (
                <button
                  key={chapter.title}
                  type="button"
                  className="tacet-proto-story__chapter"
                  data-aira-chapter=""
                  data-step={index + 1}
                  aria-pressed={index === 2 ? "true" : "false"}
                >
                  <span aria-hidden="true">{`0${index + 1}`}</span>
                  <span>
                    <strong>{chapter.title}</strong>
                    <small>{chapter.text}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <figure className="tacet-proto-story__media aira-story__media" aria-label={story.mockLabel}>
            <StoryMock mock={story.mock} />
          </figure>
        </article>
      </div>
    </section>
  );
}
