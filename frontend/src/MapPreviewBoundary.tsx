import { Component, type ReactNode } from "react";
export class MapPreviewBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.warn("Map preview failed to load", error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="campus-map" aria-label="Map preview unavailable">
        <img
          src="/images/campus-fallback.png"
          alt="UC Irvine architectural overview"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.5,
          }}
        />
        <p
          role="status"
          style={{
            position: "absolute",
            top: "35%",
            left: "15%",
            right: "15%",
            background: "var(--color-bg)",
            padding: 20,
          }}
        >
          The map could not load. Room search is still available.{" "}
          <a href={window.location.href}>Reload map</a>
          {" · "}
          <a
            href={(() => {
              const u = new URL(window.location.href);
              u.searchParams.set("map", "schematic");
              return u.href;
            })()}
          >
            Use lightweight map
          </a>
        </p>
      </section>
    );
  }
}
