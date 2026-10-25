/**
 * Tests for the "Professional logo" picker. Run with:  pnpm test:customizer-logo
 *
 * All pure: builds a config with a LOGO zone, a design that picks a logo, and
 * checks resolution, the proof render, validation and the fingerprint. No DB.
 */
import { designFingerprint, isDesignEmpty, type CustomerDesign } from "@/lib/customizer/design";
import {
  customizerConfigSchema,
  logoChoiceOf,
  resolveLogoUrl,
  readConfig,
  requiredZones,
  type CustomizerConfig,
} from "@/lib/customizer/schema";
import { renderComposite } from "@/server/customizer/render";
import { validateDesign } from "@/server/customizer/service";

let failures = 0;
function check(name: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

function buildConfig(required: boolean): CustomizerConfig {
  return customizerConfigSchema.parse({
    enabled: true,
    version: 1,
    views: [{ id: "front", label: "Front", base: "/api/media/base", zoneIds: ["logo1"] }],
    zones: [
      {
        id: "logo1",
        kind: "LOGO",
        label: "Professional logo",
        x: 30,
        y: 30,
        width: 40,
        height: 30,
        required,
        logoChoices: [
          { id: "chef", label: "Chef", imageUrl: "/logos/chef.png" },
          { id: "om", label: "Om", imageUrl: "/logos/om.png" },
        ],
      },
    ],
  });
}

function design(choiceId: string): CustomerDesign {
  return { configVersion: 1, viewId: "front", zones: choiceId ? { logo1: { kind: "LOGO", logo: { choiceId } } } : {}, options: {}, style: {} };
}

async function main() {
  console.log("\nProfessional logo tests");

  const config = buildConfig(true);
  const zone = config.zones[0];

  // --- resolution --------------------------------------------------------
  check("resolveLogoUrl returns the chosen logo", resolveLogoUrl(zone, design("om")) === "/logos/om.png");
  check("logoChoiceOf returns the chosen choice", logoChoiceOf(zone, design("chef"))?.label === "Chef");
  check(
    "required zone falls back to the first logo when none is picked",
    resolveLogoUrl(zone, design("")) === "/logos/chef.png",
  );
  const optionalZone = buildConfig(false).zones[0];
  check("optional zone shows nothing until picked", resolveLogoUrl(optionalZone, design("")) === "");
  check("an unknown choice does not resolve", resolveLogoUrl(optionalZone, design("nope")) === "");

  // --- required / empty --------------------------------------------------
  check("a required LOGO zone is in requiredZones", requiredZones(config).some((z) => z.id === "logo1"));
  check("a logo pick is not an empty design", isDesignEmpty(design("chef")) === false);
  check("no pick is an empty design", isDesignEmpty(design("")) === true);

  // --- fingerprint -------------------------------------------------------
  check("fingerprint differs by chosen logo", designFingerprint(design("chef")) !== designFingerprint(design("om")));
  check("fingerprint is stable for the same pick", designFingerprint(design("om")) === designFingerprint(design("om")));

  // --- proof render ------------------------------------------------------
  const view = config.views[0];
  const proof = renderComposite({
    config,
    design: design("om"),
    view,
    assets: new Map(),
    base: null,
    overlay: null,
    frameImages: new Map([["logo1", { base64: "AAAA", contentType: "image/png" }]]),
  });
  check("proof embeds the chosen logo PNG", proof.svg.includes("data:image/png;base64,AAAA"));
  const proofUrl = renderComposite({
    config,
    design: design("chef"),
    view,
    assets: new Map(),
    base: null,
    overlay: null,
    frameImages: new Map(),
  });
  check("proof references the logo URL when not embedded", proofUrl.svg.includes("/logos/chef.png"));

  // --- validation (no DB: LOGO-only design has no uploads to check) -------
  const okRes = await validateDesign({ config, design: design("chef"), userId: null, guestToken: null });
  check("a picked required logo validates clean", okRes.issues.length === 0, JSON.stringify(okRes.issues));
  const missRes = await validateDesign({ config, design: design(""), userId: null, guestToken: null });
  check("a missing required logo is reported", missRes.issues.some((i) => i.zoneId === "logo1"));
  const badRes = await validateDesign({ config, design: design("ghost"), userId: null, guestToken: null });
  check("a logo that no longer exists is reported", badRes.issues.some((i) => i.zoneId === "logo1"));

  // --- round-trips through readConfig ------------------------------------
  const reread = readConfig(JSON.parse(JSON.stringify(config)));
  check("config with a LOGO zone survives readConfig", reread.enabled && reread.zones[0]?.kind === "LOGO");
  check("logoChoices survive the round-trip", reread.zones[0]?.logoChoices.length === 2);

  if (failures > 0) {
    console.log(`\n✗ ${failures} check(s) failed`);
    process.exit(1);
  }
  console.log("\n✓ All professional-logo tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
