import React from "react";

// The rule-19 mock/real banner, the honest "what is simulated" banner, and the intro. Every page shows
// the simulation banner first (rule 2), also in presenter mode. In Real mode an extra banner states
// exactly what the tenant's live AI Gateway decided versus what this lab still simulates.
export default function Banner({ story, mode }) {
  return (
    <div data-testid="banner">
      <p className="banner" data-testid="sim-banner">{story.banner}</p>
      {mode === "real" && (
        <p className="banner banner-real" data-testid="real-banner">
          {story.realBanner} The decision comes from the tenant's live AI Gateway. The intent table, the encoder probe and the diagram stay simulations.
        </p>
      )}
      <p className="intro">{story.intro}</p>
    </div>
  );
}
