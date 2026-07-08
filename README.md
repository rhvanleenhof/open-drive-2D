# Open Drive

A top-down driving game in plain HTML, CSS, and JavaScript — no dependencies, no build step. Cruise a procedurally generated city with traffic and pedestrians, and run getaway fares: pick up wanted criminals and deliver them across town without letting the cops pin you down.

## Run it

The game uses ES modules, so it needs to be served over HTTP (opening `index.html` directly from disk won't work in most browsers):

```bash
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

## Controls

| Key | Action |
| --- | --- |
| `W` / `↑` | Accelerate |
| `S` / `↓` | Brake / reverse |
| `A` / `←` and `D` / `→` | Steer |
| `Space` | Handbrake (drift) |

## Missions

- A yellow marker (and edge arrow) points to your fare. Stop beside them to pick them up.
- They're wanted — the moment they're in the car, police spawn and chase you.
- Deliver them to the green marker. Cops can't arrest you while you're moving: if a cop is on top of you while you're slow, the "GETTING PINNED" meter fills, and if it fills all the way you're busted.
- Your car takes damage from hard crashes (buildings, trees, parked cars, other vehicles, cop rams) above roughly 70 km/h — watch the CAR bar, and the engine smokes when it gets low. Wreck the car and the mission fails.
- Delivering repairs your car and adds a job to your tally. Fail and a new fare shows up shortly.

## Notes

- The city layout is generated from a random seed each time you load the page.
- Driving on grass slows you down; buildings, trees, parked cars, and the shoreline are solid.
- Drifting leaves tire marks on the road.
- NPC cars drive the road grid (right-hand traffic), slow for turns, and brake for cars ahead — including you. Ram one and it spins out; crashed cars respawn once you drive far away.
- Pedestrians wander the sidewalks and occasionally cross at intersections. Hit one (with your car or by watching traffic do it) and they tumble, then get back up and walk it off.
