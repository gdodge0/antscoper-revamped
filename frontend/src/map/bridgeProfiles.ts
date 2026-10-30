// UCI Transportation clearance figures describe the underside above the road.
// Widths and exterior detailing are visual estimates checked against photographs.
export const bridgeProfiles: Record<
  string,
  {
    name: string;
    width: number;
    clearance: number;
    style: "arts" | "truss" | "concrete";
    levelDeck?: boolean;
    preserveGround?: boolean;
    elevatedLandings?: number[];
    attachment?: { buildingId: string; floor: number };
    underpass?: string;
    deckRise?: number;
  }
> = {
  w171169264: {
    name: "Arts–Humanities Bridge",
    width: 4.8,
    clearance: 6.096,
    style: "arts",
  },
  w624135494: {
    name: "Student Center–Mesa Court Bridge",
    width: 3.6,
    clearance: 5.4864,
    style: "truss",
    elevatedLandings: [1],
    attachment: { buildingId: "w157979894", floor: 2 },
  },
  w155705065: {
    name: "Mesa Parking–Arts Bridge",
    width: 3.2,
    clearance: 4.572,
    style: "concrete",
    levelDeck: true,
    preserveGround: true,
    elevatedLandings: [0, 1],
    attachment: { buildingId: "w171169301", floor: 3 },
  },
  w171169276: {
    name: "Humanities–Student Center Bridge",
    width: 6,
    clearance: 3,
    style: "concrete",
    levelDeck: true,
    underpass: "w1195385844",
    attachment: { buildingId: "w157979900", floor: 3 },
  },
  w171169260: {
    name: "Engineering Pedestrian Bridge",
    width: 6,
    clearance: 4.8768,
    style: "concrete",
  },
  w171169265: {
    name: "Palo Verde Pedestrian Bridge",
    width: 3.5,
    clearance: 4.572,
    style: "concrete",
    levelDeck: true,
    preserveGround: true,
    elevatedLandings: [0, 1],
    deckRise: 0,
  },
  w171169271: {
    name: "Science Library Pedestrian Bridge",
    width: 4.5,
    clearance: 5.1816,
    style: "concrete",
  },
  w171169272: {
    name: "Athletics Pedestrian Bridge",
    width: 3.6,
    clearance: 3.9624,
    style: "concrete",
  },
  w171194239: {
    name: "Watson Bridge",
    width: 4.5,
    clearance: 4.7244,
    style: "concrete",
    preserveGround: true,
    elevatedLandings: [0, 1],
    deckRise: 0.75,
  },
  w1196280279: {
    name: "Continuing Education Pedestrian Bridge",
    width: 4,
    clearance: 5.4864,
    style: "concrete",
    levelDeck: true,
    preserveGround: true,
    elevatedLandings: [0, 1],
    deckRise: 0,
  },
};
export const modeledBridgeIds = new Set(Object.keys(bridgeProfiles));
export const bridgeReferences = [
  "https://parking.uci.edu/traffic/access-clearance/",
  "https://www.physics.uci.edu/~silverma/build/artsbridge.jpg",
  "https://news.uci.edu/2016/06/20/walk-this-way-new-pedestrian-bridge-to-connect-campus-community/",
];

export const modeledAccessPathIds = new Set([
  "w171194224",
  "w171194269",
  "w171194256",
  "w219169792",
  "w1213661222",
  "w1196297209",
  "w1213661223",
]);
export const modeledAccessSurfaceIds = new Set(["w1213661221"]);
