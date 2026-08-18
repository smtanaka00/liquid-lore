This is the complete feature specification for **Liquid Lore**. You can save this as `FEATURES.md` in your project folder to keep track of the vision and current implementation status.

---

# 🍸 Liquid Lore: Feature Specification

**Liquid Lore** is a premium, "story-first" cocktail discovery and management platform. It blends the utility of a bar tool with the engagement of a social network and the beauty of a high-end coffee table book.

## 🎨 1. Visual & Aesthetic Experience
*   **Modern Speakeasy Theme:** A high-contrast UI featuring a dark zinc palette, gold/amber accents, and elegant serif typography.
*   **High-Resolution Imagery:** Curated, professional photography for "Classic" cocktails to provide a premium feel.
*   **Visual Hover Effects:** Grayscale-to-color transitions on drink cards to mimic an art gallery experience.
*   **Responsive Design:** Fully optimized for mobile (active mixing) and desktop (discovery and browsing).

## 📖 2. Content & Storytelling
*   **Global Recipe Library:** Integration with a massive database (TheCocktailDB) covering thousands of international recipes.
*   **The "Lore" Layer:** Hand-crafted historical context for legendary drinks (e.g., the origins of the Negroni or Sazerac).
*   **Pro Mixing Tips:** Expert-level advice for specific drinks (e.g., "Always stir for 30 seconds" or "Express the citrus oils").
*   **Visual Glassware Guide:** Dynamic icons indicating the correct glass for every drink (Rocks, Coupe, Highball, etc.).

## 🧪 3. The Logic Engine (The "Brain")
*   **"My Cabinet" Inventory:** A digital shelf where users save the spirits, mixers, and bitters they currently own.
*   **"What Can I Make?" Matching:** Real-time filtering that shows only the cocktails a user can make with their current inventory.
*   **The "Near Miss" Feature:** Displays cocktails where the user is missing exactly one ingredient.
*   **The Maximizer:** A smart recommendation tool that suggests the single best ingredient to buy next to unlock the maximum number of new recipes.

## 👨‍🍳 4. Interactive Mixing Experience
*   **Step-by-Step Instructions:** Clearly numbered, easy-to-read preparation steps.
*   **"Mixing Mode":** A dedicated, hands-free UI with massive text and a progress bar, designed for use while active in the kitchen or bar.
*   **Dynamic Unit Conversion:** Toggle between Milliliters (ml), Ounces (oz), and Parts.
*   **Garnish Guide:** Specific visual instructions for the final presentation of the drink.

## 👥 5. Social & Community Features
*   **The Creator Studio:** A multi-step form for users to build and document their own cocktail inventions.
*   **The "Lounge" Feed:** A community activity feed where users can see, like, and save recipes created by other mixologists.
*   **User Profiles:** Public-facing pages showcasing a user's "Signature Drinks" and their expertise level.
*   **Social Sharing:** Generation of "Drink Cards" with unique URLs to share specific recipes via text or social media.

## 🔐 6. Personalization & Persistence
*   **Cloud Sync (Supabase):** User accounts that save cabinets and favorites across multiple devices (Mobile/Laptop).
*   **Favorites & Wishlist:** A private collection of "Go-To" drinks and "Must-Try" discoveries.
*   **Private Tasting Notes:** A section for users to add their own ratings and "Twists" (e.g., "I liked this better with extra lime").
*   **Flavor Profile Tagging:** Search and discovery based on "Vibes" (Smoky, Bitter, Refreshing, Boozy).
*   **Persistent Cabinet & Guest Mode:** LocalStorage fallback for guests and cloud-sync for members ensures inventory is never lost.

## 🛠 7. Technical Excellence
*   **PWA Support:** Installable as a "Native-feel" app on iOS and Android home screens.
*   **Hybrid Data Sourcing:** Seamless merging of real-time API data with custom "Premium Lore" JSON overrides.
*   **Offline Mode:** Basic access to saved favorites even when the internet is unavailable.

---

### Implementation Status Check:
- [x] **Core UI/UX** (Speakeasy Theme)
- [x] **Global API Integration** (TheCocktailDB)
- [x] **Premium Lore Merger** (Custom Stories)
- [x] **My Cabinet Logic** (Filtering & Recommendations)
- [x] **Recipe Detail View** (Ingredients & Steps)
- [x] **Database Schema** (Supabase Tables)
- [x] **Mixing Mode UI** (Interactive steps)
- [x] **Creator Studio** (Recipe Builder Form)
- [x] **Social Infrastructure** (Lounge Feed)
- [x] **Searchable Cabinet** (Phase 1)
- [x] **The "Maximizer" UI** (Phase 2)
- [x] **AI Flavor Assistant** (Phase 3)
- [x] **QR Code Sharing** (Phase 4)
- [x] **PWA Support** (Phase 5)
- [x] **Offline Resilience** (Phase 6)
- [x] **Visual Garnish Guide** (Phase 6)
- [x] **Visual Glassware Guide** (Phase 7)
- [x] **Public User Profiles** (Phase 7)
- [x] **Community Social Feed** (Lounge Interactivity) (Phase 7)
- [x] **Advanced Tasting Notes** (Ratings & Twists) (Phase 7)
- [x] **1,050 Recipe Library Expansion** (Phase 8)
- [x] **Supabase SQL Migration for Cocktails** (Phase 8)
- [x] **Static-First Recommendation Engine** (Phase 8)
- [x] **Persistent Cabinet & Guest Mode** (Phase 9)
- [x] **Unified Profile Cabinet Management** (Phase 9)

---

## 🚀 8. Future Improvements & Roadmap
*   **Live Unsplash Sync:** Use the Unsplash API to dynamically update the "Original" recipe photos with spirit-matched imagery.
*   **TheCocktailDB Hybrid Sync:** Real-time data merging for classics to ensure photo and ingredient accuracy.
*   **Self-Hosted Assets:** Migrate all external photo URLs to Supabase Storage for better performance and reliability.
*   **Automated Data Pipeline:** Scripts to keep the JSON source, CSV exports, and Supabase tables in perfect synchronization.