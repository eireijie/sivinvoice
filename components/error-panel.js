export function ErrorPanel({ error }) {
  return (
    <div className="panel">
      <h2>Configuration needed</h2>
      <p className="muted">
        The app is missing part of its server configuration. Check the environment settings and database setup, then reload this page.
      </p>
    </div>
  );
}
