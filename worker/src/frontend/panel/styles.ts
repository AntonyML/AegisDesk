export const panelStyles = `
:root { color-scheme: light; font-family: Inter, system-ui, sans-serif; background: #f4f7fb; color: #162033; }
body { margin: 0; } main { max-width: 1180px; margin: auto; padding: 32px; }
.top { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.brand { letter-spacing: .02em; } .muted { color: #667085; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-top: 24px; }
section { background: white; border: 1px solid #dce3ed; border-radius: 16px; padding: 20px; box-shadow: 0 8px 24px #102a4d0d; }
table { width: 100%; border-collapse: collapse; font-size: 14px; } th, td { padding: 10px 8px; border-bottom: 1px solid #edf0f5; text-align: left; vertical-align: top; }
button, select { border: 1px solid #9aa9bd; background: white; border-radius: 8px; padding: 8px 10px; cursor: pointer; }
button.primary { color: white; background: #2457d6; border-color: #2457d6; } button.danger { color: #a42626; }
.pill { display: inline-block; padding: 3px 8px; border-radius: 999px; background: #e9eefb; } .pill.revoked { background: #fde7e7; color: #9d2424; }
#panel-output { min-height: 24px; color: #2457d6; }
@media (max-width: 700px) { main { padding: 18px; } .top { align-items: flex-start; flex-direction: column; } table { display: block; overflow-x: auto; } }
`;
