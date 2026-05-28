type EmptyProps = {
  text: string;
  imageSrc?: string;
};

const Empty = ({ text, imageSrc = '/robot.webp' }: EmptyProps) => (
  <div className="empty-panel fade-in">
    <img className="empty-panel-image" src={imageSrc} alt="" aria-hidden="true" />
    <div className="empty-panel-text">{text}</div>
  </div>
);

export default Empty;
