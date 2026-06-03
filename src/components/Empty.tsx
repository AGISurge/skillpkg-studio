type EmptyProps = {
  text: string;
  imageSrc?: string;
};

const defaultImageSrc = `${process.env.PUBLIC_URL || ''}/robot.webp`;

const Empty = ({ text, imageSrc = defaultImageSrc }: EmptyProps) => (
  <div className="empty-panel fade-in">
    <img className="empty-panel-image" src={imageSrc} alt="" aria-hidden="true" />
    <div className="empty-panel-text">{text}</div>
  </div>
);

export default Empty;
