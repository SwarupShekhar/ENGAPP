# Semantic Color System Guide

## Overview

This app uses a semantic color system that separates **theme colors** from **semantic colors**. Theme colors change based on the selected theme, while semantic colors remain constant across all themes.

## Color Categories

### 1. Theme Colors (Variable)
These change based on the selected theme (sunset, ocean, purple, blue):
- `primary`, `secondary`, `accent`, `deep`
- `background`, `surface`
- `text.primary`, `text.secondary`, `text.light`
- `error`, `success`, `warning`
- **Used for**: UI chrome, buttons, navigation, layout elements

### 2. Semantic Colors (Constant)
These stay the same regardless of theme:

#### Skill Colors
- **Grammar**: Indigo `#5C6BC0` (structured, intellectual)
- **Pronunciation**: Coral `#EF5350` (vocal, energetic)
- **Fluency**: Teal `#26A69A` (flowing, smooth)
- **Vocabulary**: Amber `#FFA726` (knowledge, warm)

#### Level Colors (CEFR)
- **A1** (Beginner): Slate `#78909C` → Tint `#ECEFF1`
- **A2** (Elementary): Sky Blue `#29B6F6` → Tint `#E1F5FE`
- **B1** (Intermediate): Violet `#7E57C2` → Tint `#EDE7F6`
- **B2** (Upper-intermediate): Emerald `#66BB6A` → Tint `#E8F5E9`
- **C1** (Advanced): Deep Orange `#FFA040` → Tint `#FFF3E0`
- **C2** (Proficient): Gold `#FFD600` → Tint `#FFFDE7`

## Usage Rules

### ✅ DO Use Semantic Colors For:
- Skill badges, progress bars, charts
- Level indicators and proficiency displays
- Data visualization (scores, analytics)
- Educational content and feedback

### ❌ DON'T Use Semantic Colors For:
- UI chrome (buttons, navigation, borders)
- Background surfaces
- Text that isn't skill/level related
- General app styling

## Implementation Examples

### Using the Utility Functions

```typescript
import { useAppTheme } from '../theme/useAppTheme';
import { getSkillColor, getLevelColor, getSkillBadgeStyle } from '../theme/colorUtils';

function MyComponent() {
  const theme = useAppTheme();
  
  // Get individual colors
  const grammarColor = getSkillColor(theme, 'grammar');
  const b1Color = getLevelColor(theme, 'b1');
  
  // Get badge styles (color + background)
  const pronunciationBadgeStyle = getSkillBadgeStyle(theme, 'pronunciation');
  
  return (
    <View style={pronunciationBadgeStyle}>
      <Text>Pronunciation</Text>
    </View>
  );
}
```

### Using the Reusable Components

```typescript
import { SkillBadge } from '../components/common/SkillBadge';
import { LevelBadge } from '../components/common/LevelBadge';

// Skill badges
<SkillBadge skill="grammar" score={85} />
<SkillBadge skill="pronunciation" score={92} variant="compact" />
<SkillBadge skill="fluency" score={78} variant="card" showLabel={false} />

// Level badges
<LevelBadge level="b1" />
<LevelBadge level="c2" showDescription={true} />
<LevelBadge level="a2" variant="outline" darkMode={true} />
```

### Direct Token Access

```typescript
function MyComponent() {
  const theme = useAppTheme();
  
  return (
    <View style={{ backgroundColor: theme.tokens.skill.grammarTint }}>
      <Text style={{ color: theme.tokens.skill.grammar }}>
        Grammar: 85%
      </Text>
    </View>
  );
}
```

## Badge Patterns

### Light Theme (Default)
- **Text color**: Semantic color (e.g., `#5C6BC0`)
- **Background**: Tint version (e.g., `#E8EAF6`)

### Dark Theme
- **Text color**: White (`#FFFFFF`)
- **Background**: Full semantic color (e.g., `#5C6BC0`)

## Chart & Progress Bar Usage

```typescript
import { getSkillChartColors } from '../theme/colorUtils';

function SkillProgress({ skill, progress }) {
  const theme = useAppTheme();
  const { primary: barColor, secondary: trackColor } = getSkillChartColors(theme, skill);
  
  return (
    <View style={{ backgroundColor: trackColor }}>
      <View style={{ 
        width: `${progress}%`, 
        backgroundColor: barColor 
      }} />
    </View>
  );
}
```

## Migration Checklist

When updating existing components:

1. **Remove hardcoded skill colors**:
   ```typescript
   // ❌ Before
   color: "#3B82F6" // grammar
   
   // ✅ After  
   color: getSkillColor(theme, 'grammar')
   ```

2. **Remove hardcoded level colors**:
   ```typescript
   // ❌ Before
   backgroundColor: "#7E57C2" // B1
   
   // ✅ After
   backgroundColor: getLevelColor(theme, 'b1')
   ```

3. **Use semantic components**:
   ```typescript
   // ❌ Before
   <View style={{ backgroundColor: "#E8EAF6" }}>
     <Text style={{ color: "#5C6BC0" }}>Grammar</Text>
   </View>
   
   // ✅ After
   <SkillBadge skill="grammar" />
   ```

## Testing

Verify your implementation works across:
- All theme families (sunset, ocean, purple, blue)
- Light and dark variations
- Different component sizes and variants
- Color contrast accessibility

## Benefits

1. **Consistency**: Same skill/level colors everywhere
2. **Accessibility**: Proper contrast ratios built-in
3. **Maintainability**: Change colors in one place
4. **Semantic Meaning**: Colors carry information, not just decoration
5. **Theme Independence**: Educational colors work with any visual theme
