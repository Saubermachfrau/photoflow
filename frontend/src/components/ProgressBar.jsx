.wrapper { display: flex; flex-direction: column; gap: 6px; }

.labelRow {
  display: flex; justify-content: space-between; align-items: baseline;
}

.label {
  font-size: 13px; color: var(--text-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 75%;
}

.percent {
  font-size: 13px; font-family: var(--font-mono);
  font-weight: 600; color: var(--text-primary);
}

.track {
  height: 6px; background: var(--bg-hover);
  border-radius: 4px; overflow: hidden;
}

.fill {
  height: 100%; border-radius: 4px;
  transition: width 0.4s ease;
}

.subRow {
  display: flex; justify-content: space-between; align-items: center;
}

.sub {
  font-size: 11.5px; font-family: var(--font-mono); color: var(--text-muted);
}

.right {
  display: flex; gap: 10px; align-items: center;
}

.speed {
  font-size: 11.5px; font-family: var(--font-mono); color: var(--accent);
}

.eta {
  font-size: 11.5px; font-family: var(--font-mono); color: var(--text-muted);
}
