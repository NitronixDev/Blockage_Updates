# Blockage 0.4.0

Extrais **tout le ZIP**, puis double-clique sur **START_BLOCKAGE.bat**. Node.js, npm, Electron, les dépendances, les sources et les exemples sont inclus. L'interface reste en anglais et le logo orange de la version 0.1 est de retour.

## Premier essai

1. **File → New Scene → Water Test**.
2. Clique sur **Play**.
3. Clique sur la surface de l'eau pour produire des ondulations, ou sur **Ripple** pour en produire au centre.
4. Observe le cube qui flotte et la sphère mobile qui laisse un sillage.
5. **Pause** fige l'état ; **Step** avance d'un pas ; **Stop** restaure la scène.

**Terrain Test** montre les collisions entre le terrain et les objets. **Engine Test** réunit l'eau, un terrain, un drapeau, une fontaine, une animation, un objet suiveur et un ressort entre objets. **Simulation Test** reprend les simulations de tissu, de fluide à particules et d'émetteur de la 0.2.

## Les nouveaux outils

| Outil | Où le trouver |
| --- | --- |
| Eau avec ondulations | **Add → Water**, puis section **Water** dans Properties : taille, résolution, vitesse, amortissement, pluie, amplitude et interactions. |
| Terrain | **Add → Terrain** : graine, taille, hauteur, résolution, fréquence, octaves et forme d'île. |
| Collisions et empilement | Sélectionne un cube, une sphère ou un cylindre, puis **Behaviors → Add Behavior → Rigid Body**. Masse, friction, rebond et vitesse initiale sont réglables. |
| Flottabilité | **Add Behavior → Buoyancy** ajoute aussi Rigid Body si nécessaire. Place l'objet au-dessus d'une surface Water. |
| Ressort entre objets | **Spring Joint** : choisis un objet cible avec Collider, puis règle la longueur, la raideur et l'amortissement. |
| Animation | Onglet **Animation** et curseur temporel sous la vue. **K / Insert Key** mémorise position, rotation et échelle. |
| Caméra de jeu | **Add → Camera**, puis bouton **Game** et **Play**. **WASD** déplace la caméra ; bouton droit pour regarder ; **Shift** accélère ; **Espace** fait sauter le contrôleur Walk. |
| Audio 3D | **Import** accepte WAV, MP3 et OGG. Double-clique sur le son dans Assets pour créer une source. Volume, hauteur, boucle et atténuation sont réglables. |
| Zones d'action | **Add → Trigger**. En mode Game, entrer dans sa boîte peut jouer un son ou changer la visibilité d'un objet cible. |
| Prefabs | **File → Export Selected as Prefab** exporte l'objet et ses enfants. **Import Prefab** crée une nouvelle instance avec ses ressources. |
| Textures PBR | Section **Texture Maps** : normales, rugosité, métal et émission, en complément de la couleur de base. |
| Autres comportements | **Path Motion**, **Follow Target**, **Look At**, ainsi que les comportements des versions précédentes. |

Pour animer un objet : ajoute une clé à 0 seconde, déplace le curseur temporel, déplace l'objet, puis ajoute une deuxième clé. Le curseur prévisualise les clés enregistrées. Les réglages de durée, de fréquence d'images et de boucle sont dans les paramètres de scène. Un objet avec une animation de transformation active ne peut pas cumuler des comportements qui contrôlent les mêmes transformations ; désactive **Animation → Enabled** si tu veux employer ces comportements.

Les clips intégrés aux modèles GLB sont dans **Model Animation**. `examples/assets/AnimatedCube.glb` contient un petit exemple. Pour essayer les sons et les zones, ouvre **examples/AudioTest.blockage**, active **Game**, lance **Play** et avance vers le cube.

## Sauvegardes et lancement

**Ctrl S** sauvegarde la scène ; **Ctrl O** l'ouvre ; **Ctrl I** importe des ressources ; **Ctrl Z / Ctrl Shift Z** annule/rétablit. **Ctrl P** cherche une commande. Les scènes des versions 0.1, 0.2 et 0.3 sont lisibles et migrent au format 4. Les ressources sont intégrées aux fichiers de scène et aux prefabs.

- **START_BLOCKAGE.bat** : rendu automatique.
- **START_BLOCKAGE_COMPAT.bat** : WebGL 2, utile en cas de vue noire ou d'erreur graphique.
- **START_BLOCKAGE_VULKAN.bat** : demande expérimentale du backend Vulkan de Chromium, selon les possibilités du pilote.
- **START_PLAYER.bat** : lecteur de scènes ; utilise Open scene pour choisir ton fichier.
- **DEV_TERMINAL.bat** : terminal avec Node.js et npm inclus. `npm test`, `npm run check`, `npm run doctor`.
- **INSTALL_DEPENDENCIES.bat** : réparation des dépendances, avec accès Internet.

## Limites de cette version

Les simulations restent des prototypes sur le CPU. L'eau est une surface à hauteur variable ; les fluides volumétriques utilisent un autre solveur à particules. Les corps solides disposent de collisions simples et d'impulsions linéaires, sans rotation physique ni collision par triangles. Le tissu ne possède pas d'auto-collision. Le contrôleur de caméra, les zones d'action et l'audio fournissent une première base pour des scènes jouables.

La version ne contient pas encore de réseau multijoueur, de scripting de gameplay, de navigation automatique, d'éditeur de shaders ou de compilation d'un jeu indépendant. Les limites précises et la suite du développement sont dans `README.md` et `docs/ROADMAP.md`.

Les essais ont été réalisés dans Electron sous Linux avec le rendu logiciel WebGL. Le lancement Windows, le rendu sur ta carte graphique, Vulkan et la sortie sonore réelle restent à vérifier sur ton PC.


## Imports et personnages — 0.4

**File → Import Assets** permet de sélectionner plusieurs modèles. **File → Import Model Folder** importe jusqu’à 100 modèles dans un dossier et ses sous-dossiers. Formats : GLB, GLTF, OBJ/MTL, FBX, STL, PLY, DAE et 3MF. Les textures et buffers sont intégrés à la scène sauvegardée. Les ressources doivent rester dans le dossier choisi ; pour des modèles isolés, place-les avec leurs ressources dans le même dossier ou ses sous-dossiers.

Pour **BLEND**, installe Blender puis indique `blender.exe` dans **Edit → Preferences**. Blender convertit le modèle en GLB en arrière-plan. Blender n’est pas inclus dans le ZIP.

Double-clique sur un modèle importé pour l’ajouter. **Properties → Rigging** affiche son squelette, les os et leurs offsets. **Use Bone Gizmo** permet de déplacer, tourner et agrandir un os ; **Object Mode** revient à l’objet. Place le curseur temporel puis **Insert Pose Key** pour enregistrer une pose. Les poses et les clés se sauvegardent et se retrouvent dans les prefabs. **Create Rig** génère une chaîne verticale ou un squelette humanoïde approximatif pour une géométrie statique ; l’édition fine des poids et l’IK ne sont pas encore disponibles.

**Add → Player** ajoute un mannequin prêt à jouer. Lance **Play**, active **Game** et clique dans la vue : ZQSD/WASD pour bouger, Shift pour courir, Espace pour sauter, clic droit glissé pour regarder. Dans **Properties → Player**, règle les vitesses, l’accélération, les collisions, la caméra et les quatre rôles d’animation. Un modèle importé peut aussi recevoir le contrôleur en cochant **Player Controller** et en choisissant ses clips.

**File → New Scene → Character Test** ouvre une scène de test avec obstacles. `examples/ImportedCharacter.blockage` utilise un GLB skinné. Les fichiers GLB, FBX et BLEND du personnage original sont fournis dans `examples/assets`.

## Mises à jour GitHub

Dans **Edit → Preferences**, saisis `propriétaire/dépôt` ou l’URL du dépôt GitHub public. **Help → Check for Updates** propose la dernière release stable. Le moteur vérifie le SHA-256, installe dans un nouveau dossier, puis permet d’ouvrir ce dossier ou de sauvegarder et redémarrer. Aucun dépôt n’est préconfiguré.

Le workflow `.github/workflows/release.yml` crée les ZIP Windows et leurs empreintes lorsqu’un tag `vX.Y.Z` correspondant à `package.json` est envoyé sur ton dépôt. Les instructions sont dans `docs/GITHUB_UPDATES.md`.
