-- Master pricing catalog. Replaces the hard-coded PRICING_CATALOG in
-- PricingView.tsx so users can update costs and add/remove items at
-- any time without a code deploy.

CREATE TABLE IF NOT EXISTS pricing_catalog (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    cost         DOUBLE PRECISION NOT NULL DEFAULT 0,
    category     TEXT NOT NULL,
    manual_price BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT '',
    updated_at   TEXT NOT NULL DEFAULT ''
);

-- Seed with the items previously hard-coded in the frontend.
-- IDs are stable so the existing pricingCache (which referenced array
-- indices) can be migrated client-side by matching sort_order.
INSERT INTO pricing_catalog (id, name, cost, category, manual_price, sort_order, created_at, updated_at) VALUES
  ('pc-dock3-001', 'DJI Matrice 4D with RC Plus 2',                              6798.80, 'DJI Dock 3',              FALSE,  0, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-dock3-002', 'DJI Matrice 4TD with RC Plus 2',                             8469.75, 'DJI Dock 3',              FALSE,  1, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-dock3-003', 'DJI Dock 3',                                                 11684.00, 'DJI Dock 3',             FALSE,  2, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-dock3-004', 'DJI Matrice 4D',                                             4834.60, 'DJI Dock 3',              FALSE,  3, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-dock3-005', 'DJI Matrice 4TD',                                            6847.10, 'DJI Dock 3',              FALSE,  4, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-dock3-006', 'DJI Matrice 4D Series Battery',                              346.92,  'DJI Dock 3',              FALSE,  5, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-dock3-007', 'DJI Matrice 4D Series 240W Charging Hub',                    127.60,  'DJI Dock 3',              FALSE,  6, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-dock3-008', 'DJI 240W Power Adapter',                                     179.80,  'DJI Dock 3',              FALSE,  7, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-dock3-009', 'RC Plus 2 Enterprise',                                       1687.50, 'DJI Dock 3',              FALSE,  8, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-dock3-010', 'DJI Matrice 4D Series Low-Noise Anti-Ice Propellers',        48.00,   'DJI Dock 3',              FALSE,  9, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-dock3-011', 'AL1 Spotlight',                                              300.00,  'DJI Dock 3',              FALSE, 10, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-dock3-012', 'AS1 Speaker',                                                242.68,  'DJI Dock 3',              FALSE, 11, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-dock3-013', 'D-RTK 3 Relay Fixed Deployment Version',                     2435.70, 'DJI Dock 3',              FALSE, 12, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-dock3-014', 'DJI Manifold 3',                                             1740.00, 'DJI Dock 3',              FALSE, 13, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-dock3-015', 'DJI Matrice 4D Obstacle Sensing Module',                     1955.00, 'DJI Dock 3',              FALSE, 14, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-dock3-016', 'AVSS Parachute',                                             2352.00, 'DJI Dock 3',              FALSE, 15, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-daa-001',   'DroneTag Scout',                                             5473.08, 'DAA',                     FALSE, 16, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-daa-002',   'DroneTag Scout License 1YR',                                 920.00,  'DAA',                     FALSE, 17, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-daa-003',   'DroneTag Scout License 1YR Additional Sensor',               331.20,  'DAA',                     FALSE, 18, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-daa-004',   'Uavionix / Casia G 1YR',                                     20000.00, 'DAA',                    FALSE, 19, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-sun-001',   'Sunflower Package per BeeHive (12-Month Lease)',             41340.00, 'Sunflower (12-Month)',   FALSE, 20, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-sun-002',   'Sunflower Package per BeeHive (36-Month Lease)',             110682.00, 'Sunflower (36-Month)',  FALSE, 21, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-acc-001',   'Axis Outdoor Camera for Dock',                               799.00,  'Accessories',             FALSE, 22, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-acc-002',   'Starlink Enterprise Kit',                                    400.00,  'Accessories',             FALSE, 23, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-acc-003',   'Starlink Enterprise 1TB Monthly',                            290.00,  'Accessories',             FALSE, 24, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-svc-001',   'DroneSense License Fee (Annual)',                            8000.00, 'Installation & Services', TRUE,  25, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-svc-002',   'DJI Installation',                                           8000.00, 'Installation & Services', TRUE,  26, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-svc-003',   'Sunflower Installation',                                     4500.00, 'Installation & Services', TRUE,  27, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-svc-004',   'Casia G Installation',                                       5000.00, 'Installation & Services', TRUE,  28, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-svc-005',   'DroneTag Installation',                                      1500.00, 'Installation & Services', TRUE,  29, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'),
  ('pc-svc-006',   'Skydio Installation',                                        0,       'Installation & Services', TRUE,  30, '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z')
ON CONFLICT (id) DO NOTHING;
