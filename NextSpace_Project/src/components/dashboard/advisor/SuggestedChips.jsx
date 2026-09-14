export default function SuggestedChips({ chips, onPick, disabled }) {
    if (!chips || chips.length === 0) return null

    return (
        <div className="advisor-chips">
            {chips.map((chip) => (
                <button
                    key={chip}
                    type="button"
                    className="advisor-chip"
                    onClick={() => onPick(chip)}
                    disabled={disabled}
                >
                    {chip}
                </button>
            ))}
        </div>
    )
}
