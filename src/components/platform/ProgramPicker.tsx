export default function ProgramPicker({ programs, selected }: { programs: { id: string; title: string }[]; selected?: string }) {
  return <form className="tp-flex tp-gap-3 tp-items-center"><label htmlFor="program-picker">البرنامج</label>
    <select id="program-picker" name="programId" defaultValue={selected} className="platform-input">
      {programs.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
    </select><button type="submit" className="brand-btn brand-btn-secondary">عرض</button>
  </form>;
}
