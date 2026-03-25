// Map obstacle definitions — normalized coords (0-1) relative to background image
// Edit visually with editor.html, then paste the exported string below.

export const MAP_OBSTACLES = [
  { nx: 0.2723, ny: -0.0066, nw: 0.4581, nh: 0.2391, nr: 0.3305, label: "Top Building" },
  { nx: 0.2724, ny: 0.7558, nw: 0.4579, nh: 0.2542, nr: 0.2642, label: "Bottom Building" },
  { nx: -0.0159, ny: 0.0046, nw: 0.136, nh: 0.2223, nr: 0.258, label: "TL Corner" },
  { nx: 0.8945, ny: 0.0037, nw: 0.135, nh: 0.225, nr: 0.3435, label: "TR Corner" },
  { nx: -0.007, ny: 0.759, nw: 0.1289, nh: 0.239, nr: 0.1882, label: "BL Corner" },
  { nx: 0.0947, ny: 0.0173, nw: 0.0678, nh: 0.0607, nr: 0.4239, label: "Car TL" },
  { nx: -0.0057, ny: 0.2307, nw: 0.0753, nh: 0.0867, nr: 0.3156, label: "Car L1" },
  { nx: -0.0072, ny: 0.6633, nw: 0.0952, nh: 0.0814, nr: 0.5, rot: 7.4572, label: "Car L2" },
  { nx: 0.2205, ny: 0.8668, nw: 0.0689, nh: 0.0802, nr: 0.1982, rot: 110.8123, label: "Car BL" },
  { nx: 0.8462, ny: 0.8481, nw: 0.0449, nh: 0.1346, nr: 0.5, rot: 343.6354, label: "Car BR" },
  { nx: 0.8929, ny: 0.7499, nw: 0.135, nh: 0.225, nr: 0.3435, label: "BR Corner" },
];
