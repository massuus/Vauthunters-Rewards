# Reward model previews

The 22 companion rewards listed in `companions.json` and Terra Weapons cards
use original Minecraft geometry and textures. The companion renderer plays idle
by default, movement while hovering the card, sleep on click, and the sleepy loop
until clicked again. Enter and Space also toggle sleep from the preview. Movement
uses the model's own run, walk, or floating clip, and the full sleep transition
plays before sleeping loops begin. Reduced motion uses a static awake or sleeping
pose. Companions face right, viewed from slightly above. Mixed Halloween and
Christmas rewards retain their additional weapon artwork beside the companion.

Only visible previews animate, the renderer loads on demand, and all previews
share a WebGL context. Unsupported browsers and failed loads retain the original
images. These assets are from Vault Hunters; ownership remains with its artists.

To regenerate the asset bundles and preview catalog from a local installation (read only):

```powershell
python scripts/reward-models/extract.py 'C:\path\to\the_vault.jar'
```

Run `npm run dev` and open All Rewards or a player's owned/missing rewards.
The supplied remastered.7152 mod has no Golden Mini Dweller model registration
or gold texture, so that upcoming companion retains its GIF. Girl Boss is an
armor reward, not a companion. New assets may need additional GeckoLib/Molang
features before they can be added. The mappings were checked against the mod's
`PetModelType` resource references.
