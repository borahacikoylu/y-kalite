import subprocess, json, time, os
from codecarbon import EmissionsTracker

os.makedirs("results", exist_ok=True)

RUNS = 5
run_results = []

for i in range(RUNS):
    print(f"Tur {i+1}/{RUNS}...")
    tracker = EmissionsTracker(
        project_name="site_test",
        output_dir="results",
        log_level="error",
        save_to_file=False,
    )
    tracker.start()
    t0 = time.time()

    subprocess.run(["node", "test.js"], capture_output=True)

    elapsed = time.time() - t0
    data = tracker.stop()
    final_data = getattr(tracker, "final_emissions_data", None)
    energy_kwh = getattr(final_data, "energy_consumed", None)
    emissions_kg = getattr(final_data, "emissions", None)
    cpu_power_w = getattr(final_data, "cpu_power", None)

    if emissions_kg is None and isinstance(data, (int, float)):
        emissions_kg = float(data)

    run_results.append({
        "run": i + 1,
        "duration_sec":   round(elapsed, 3),
        "energy_kwh":     round(energy_kwh, 10) if energy_kwh is not None else None,
        "emissions_kgCO2": round(emissions_kg, 10) if emissions_kg is not None else None,
        "cpu_power_w":    round(cpu_power_w, 4) if cpu_power_w is not None else None,
    })
    if energy_kwh is not None:
        print(f"  OK {energy_kwh:.2e} kWh")
    elif emissions_kg is not None:
        print(f"  OK {emissions_kg:.2e} kgCO2")
    else:
        print("  OK Olcum alindi")

energy_values = [r["energy_kwh"] for r in run_results if r["energy_kwh"] is not None]
co2_values = [r["emissions_kgCO2"] for r in run_results if r["emissions_kgCO2"] is not None]

avg_energy = sum(energy_values) / len(energy_values) if energy_values else None
avg_co2 = sum(co2_values) / len(co2_values) if co2_values else None

output = {
    "runs": run_results,
    "avg": {
        "energy_kwh":      round(avg_energy, 10) if avg_energy is not None else None,
        "emissions_kgCO2": round(avg_co2, 10) if avg_co2 is not None else None,
    }
}

with open("results/codecarbon_results.json", "w") as f:
    json.dump(output, f, indent=2)

print("\nSonuc: results/codecarbon_results.json")