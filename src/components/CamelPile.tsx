import { GoodsArt } from "./Art.tsx";

/** A visible herd, or a fixed decorative stack when its size is private. */
export function CamelPile({
  count,
  motionAnchor,
}: {
  count: number | null;
  motionAnchor?: string;
}) {
  const privateHerd = count === null;
  const layers = privateHerd ? 3 : Math.max(1, Math.min(3, count));
  return (
    <span
      className={`camel-pile${privateHerd ? " camel-pile-private" : ""}${count === 0 ? " camel-pile-empty" : ""}`}
      role="img"
      aria-label={
        privateHerd ? "对手驼队，数量保密" : `驼队，共 ${count} 头骆驼`
      }
      data-motion-anchor={motionAnchor}
    >
      <span className="camel-pile-stack" aria-hidden="true">
        {Array.from({ length: layers }, (_, index) => (
          <span className="camel-pile-card camel" key={index}>
            {index === layers - 1 && <GoodsArt good="camel" cardFace />}
          </span>
        ))}
      </span>
      <b className="camel-pile-count" aria-hidden="true">
        {privateHerd ? "?" : count}
      </b>
    </span>
  );
}
