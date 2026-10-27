$ErrorActionPreference = 'Stop'
$src = Get-Content 'c:\Users\wyf20\Desktop\app\mobile\src\assets\cityToPrefecture.ts' -Raw -Encoding UTF8
$ms = [regex]::Matches($src, '"([^"]+)":\s*"(\d+)"')
$lines = New-Object System.Collections.Generic.List[string]
foreach ($m in $ms) {
    $name = $m.Groups[1].Value
    $id = $m.Groups[2].Value
    $lines.Add(('    "' + $name + '" to "' + $id + '"'))
}
$joined = ($lines -join ",`n")
$out = @"
package com.travelguide.app.data.model

/** 城市名 → 地级市区划码（由 RN assets/cityToPrefecture.ts 生成，勿手改） */
val CITY_TO_PREFECTURE: Map<String, String> = mapOf(
$joined,
)
"@
$dst = 'c:\Users\wyf20\Desktop\app\android-native\app\src\main\java\com\travelguide\app\data\model\CityToPrefecture.kt'
[System.IO.File]::WriteAllText($dst, $out, (New-Object System.Text.UTF8Encoding($false)))
Write-Host ("entries: " + $ms.Count)
