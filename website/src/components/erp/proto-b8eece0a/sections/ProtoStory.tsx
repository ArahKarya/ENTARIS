import type { Story } from "../storyData";
import { ProtoEyebrow } from "./ProtoEyebrow";

const PROTO_ASSETS = "/assets/assets";
const IMAGES = `${PROTO_ASSETS}/images/proto`;
const VIDEOS = `${PROTO_ASSETS}/videos/proto`;

/** m03 / m04 / m05 — sticky story with a `data-proto-motion` player (driven by useProtoMotion). */
export function ProtoStory({ story }: { story: Story }) {
  const stage = `${IMAGES}/proto-${story.stageKey}-stage-sketch-v1`;
  return (
    <section id={story.sectionId} className={story.sectionClassName}>
      <div className="tacet-proto-wrap">
        <article className={`tacet-proto-story tacet-proto-story--${story.side}`} data-proto-motion="" aria-labelledby={story.titleId}>
          <div className="tacet-proto-story__copy">
            <div className="tacet-proto-story__intro">
              <ProtoEyebrow name={story.eyebrowName} context={story.eyebrowContext} />
              <h2 id={story.titleId}>{story.title}</h2>
              <p>{story.lede}</p>
            </div>
            <div className="tacet-proto-story__chapters" role="group" aria-label="Jump through this Proto example">
              {story.chapters.map((chapter, index) => (
                <button key={chapter.position} type="button" className="tacet-proto-story__chapter" data-proto-motion-chapter="" data-position={chapter.position} aria-pressed={index === 0 ? "true" : "false"}>
                  <span aria-hidden="true">{`0${index + 1}`}</span>
                  <span>
                    <strong>{chapter.title}</strong>
                    <small>{chapter.text}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <figure className={`tacet-proto-story__media tacet-proto-story__media--${story.mediaKey}`} aria-label={`${story.title} — interactive Proto product walkthrough`}>
            <picture className="tacet-proto-story__stage" aria-hidden="true">
              <source srcSet={`${stage}-960.webp 960w, ${stage}.webp 1672w`} sizes="(max-width: 64rem) calc(100vw - 2rem), 66vw" type="image/webp" />
              <img src={`${stage}.webp`} alt="" width="1672" height="941" loading="lazy" decoding="async" fetchPriority="low" />
            </picture>
            <div className="tacet-proto-motion__frame">
              <video muted loop playsInline preload="none" data-proto-motion-autostart="0.52" poster={`${IMAGES}/${story.poster}`}>
                <source src={`${VIDEOS}/${story.videoKey}.webm`} type="video/webm" />
                <source src={`${VIDEOS}/${story.videoKey}.mp4`} type="video/mp4" />
              </video>
              <button type="button" className="tacet-proto-motion__toggle" data-proto-motion-toggle="" aria-label="Play video">
                Play
              </button>
            </div>
          </figure>
        </article>
      </div>
    </section>
  );
}
