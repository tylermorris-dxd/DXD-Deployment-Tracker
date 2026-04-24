-- Migration 008: Remove legacy empty tasks for stages 4 and 7, then re-seed
-- correct task + subtasks for any project that is now missing them.

DO $$
DECLARE
    v_project RECORD;
    v_task_id TEXT;
    v_sort_order INTEGER;
BEGIN

    -- Step 1: delete old-style tasks for stages 4 and 7 that have no subtasks.
    -- These were created before the per-task subtask model was established.
    DELETE FROM tasks
    WHERE stage_number IN (4, 7)
      AND id NOT IN (SELECT DISTINCT task_id FROM subtasks);

    -- Step 2: re-seed Stage 4 — Design Solution for every project that is missing it.
    FOR v_project IN
        SELECT p.id AS project_id, ph.id AS phase_id
        FROM projects p
        JOIN phases ph ON ph.project_id = p.id AND ph.phase_number = 2
        WHERE NOT EXISTS (
            SELECT 1 FROM tasks t WHERE t.project_id = p.id AND t.stage_number = 4
        )
    LOOP
        SELECT COALESCE(MAX(sort_order), -1) + 1
        INTO v_sort_order
        FROM tasks WHERE phase_id = v_project.phase_id;

        v_task_id := SUBSTRING(v_project.project_id, 1, 12) || '-b-4';

        INSERT INTO tasks (id, phase_id, project_id, title, is_gate, track_dates,
                           has_equipment_picker, has_stakeholders, sort_order, role_tag, stage_number)
        VALUES (v_task_id, v_project.phase_id, v_project.project_id,
                'Stage 4 — Design Solution', TRUE, FALSE, TRUE, FALSE,
                v_sort_order, 'solutions', 4)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO subtasks (task_id, project_id, sort_index, text, priority, condition_key) VALUES
        (v_task_id, v_project.project_id, 0,  'Solution architecture defined — products (platform, sensors, docks), services (coverage model, SOC, maintenance), operational model', 'p0', ''),
        (v_task_id, v_project.project_id, 1,  'SLA framework defined — response times, uptime, coverage, reporting cadence', 'p0', ''),
        (v_task_id, v_project.project_id, 2,  'Preliminary pricing check — does this design hit 20%+ margin? If not, adjust architecture now before going further', 'p0', ''),
        (v_task_id, v_project.project_id, 3,  'Implementation timeline estimated — account for procurement lead times, regulatory timelines, staffing needs', 'p0', ''),
        (v_task_id, v_project.project_id, 4,  'Bespoke: engage Solution Architect (Dean Pratt); define custom engineering scope; document integration architecture (VMS, access control, SIEM, APIs); get CFO margin review', 'p0', 'bespoke'),
        (v_task_id, v_project.project_id, 5,  'Starter Program: scope 1–2 docks, single site, 60–90 day window; define success metrics for conversion to full contract', 'p0', 'starter'),
        (v_task_id, v_project.project_id, 6,  'Standard bundle: select from Base/Mid/Elite tier; map customer requirements; identify add-ons needed', 'p1', '!bespoke'),
        (v_task_id, v_project.project_id, 7,  'Integration scope documented — VMS, access control, alarms, SIEM, dispatch; identify technical complexity level', 'p1', ''),
        (v_task_id, v_project.project_id, 8,  'Ops capacity check initiated — pilot availability? Equipment availability? Can we deliver on the customer''s timeline?', 'p1', ''),
        (v_task_id, v_project.project_id, 9,  'EXIT GATE: Solution architecture is defined and documented', 'exit_gate', ''),
        (v_task_id, v_project.project_id, 10, 'EXIT GATE: Preliminary pricing check passed (20%+ margin achievable)', 'exit_gate', ''),
        (v_task_id, v_project.project_id, 11, 'EXIT GATE: Solution Architect has reviewed and approved the bespoke approach', 'exit_gate', 'bespoke'),
        (v_task_id, v_project.project_id, 12, 'EXIT GATE: Implementation timeline is realistic given known constraints', 'exit_gate', '');

    END LOOP;

    -- Step 3: re-seed Stage 7 — Procure & Provision for every project that is missing it.
    FOR v_project IN
        SELECT p.id AS project_id, ph.id AS phase_id
        FROM projects p
        JOIN phases ph ON ph.project_id = p.id AND ph.phase_number = 3
        WHERE NOT EXISTS (
            SELECT 1 FROM tasks t WHERE t.project_id = p.id AND t.stage_number = 7
        )
    LOOP
        SELECT COALESCE(MAX(sort_order), -1) + 1
        INTO v_sort_order
        FROM tasks WHERE phase_id = v_project.phase_id;

        v_task_id := SUBSTRING(v_project.project_id, 1, 12) || '-c-7';

        INSERT INTO tasks (id, phase_id, project_id, title, is_gate, track_dates,
                           has_equipment_picker, has_stakeholders, sort_order, role_tag, stage_number)
        VALUES (v_task_id, v_project.phase_id, v_project.project_id,
                'Stage 7 — Procure & Provision', TRUE, TRUE, TRUE, FALSE,
                v_sort_order, 'delivery', 7)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO subtasks (task_id, project_id, sort_index, text, priority, condition_key) VALUES
        (v_task_id, v_project.project_id, 0,  'Customer kickoff meeting completed — align on timeline, roles, communication cadence, customer readiness requirements', 'p0', ''),
        (v_task_id, v_project.project_id, 1,  'Delivery plan published — milestones, resource allocation, installation schedule, risk register', 'p0', ''),
        (v_task_id, v_project.project_id, 2,  'Equipment ordered — per SOW hardware profile; vendor lead times confirmed and tracked', 'p0', ''),
        (v_task_id, v_project.project_id, 3,  'QA & provisioning — receive, inspect, configure, firmware update, stage for deployment', 'p0', ''),
        (v_task_id, v_project.project_id, 4,  'FAA waiver application filed — Eric Larson (Airspace) drives filing; Rob Robertson (Regulatory) owns operational narrative; TRACK WEEKLY — expect 4–24 weeks', 'p0', 'drones'),
        (v_task_id, v_project.project_id, 5,  'NDAA/ITAR compliance prepared for government/defense customer', 'p0', 'govdef'),
        (v_task_id, v_project.project_id, 6,  'Pilot workforce recruitment initiated — James Nguyen begins recruiting/assigning certified pilots (2–4+ week lead time)', 'p1', 'drones'),
        (v_task_id, v_project.project_id, 7,  'State/local guard licensing initiated — business entity registration, guard cards, background checks (2–6 weeks by state)', 'p0', 'manned'),
        (v_task_id, v_project.project_id, 8,  'Staffing initiated — post orders drafted, shift schedules designed, recruitment started', 'p0', 'manned'),
        (v_task_id, v_project.project_id, 9,  'EXIT GATE: Equipment ordered and delivery timeline confirmed', 'exit_gate', ''),
        (v_task_id, v_project.project_id, 10, 'EXIT GATE: Delivery plan published to customer and internal team', 'exit_gate', ''),
        (v_task_id, v_project.project_id, 11, 'EXIT GATE: All regulatory applications filed with timelines tracked', 'exit_gate', ''),
        (v_task_id, v_project.project_id, 12, 'EXIT GATE: Customer has confirmed their readiness (project sponsor, team, infrastructure)', 'exit_gate', '');

    END LOOP;

END $$;
