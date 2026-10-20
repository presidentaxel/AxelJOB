/** Réponse d'une question de la FAQ (données : src/content/faqItems.js), partagée par /faq et la landing. */
export default function FaqAnswer({ paragraphs, linkClassName = 'content-source' }) {
  return paragraphs.map((parts, i) => (
    <p key={i}>
      {parts.map((part, j) => {
        if (typeof part === 'string') return part;
        if (part.strong) return <strong key={j}>{part.strong}</strong>;
        return (
          <a key={j} href={part.href} className={linkClassName} target="_blank" rel="noopener noreferrer">
            {part.text}
          </a>
        );
      })}
    </p>
  ));
}
