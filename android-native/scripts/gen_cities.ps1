$ErrorActionPreference = 'Stop'
$src = Get-Content 'c:\Users\wyf20\Desktop\app\mobile\src\data\cities.ts' -Raw -Encoding UTF8
$ms = [regex]::Matches($src, '\{\s*name:\s*"([^"]+)",\s*letter:\s*"([A-Z])"\s*\}')
$lines = New-Object System.Collections.Generic.List[string]
foreach ($m in $ms) {
    $name = $m.Groups[1].Value
    $letter = $m.Groups[2].Value
    $lines.Add(('    CityEntry("' + $name + '", "' + $letter + '")'))
}
$joined = ($lines -join ",`n")
$out = @"
package com.travelguide.app.data.model

/** 全国地级行政区（由 RN data/cities.ts 生成，勿手改） */
data class CityEntry(val name: String, val letter: String)

val CITIES: List<CityEntry> = listOf(
$joined,
)

/** 按首字母分组；可按名称 / 字母过滤（对齐 RN citiesGrouped） */
fun citiesGrouped(filter: String = ""): List<Pair<String, List<String>>> {
    val f = filter.trim().lowercase()
    val list = if (f.isEmpty()) CITIES else CITIES.filter { c ->
        c.name.contains(filter.trim()) ||
            c.letter.lowercase() == f ||
            c.name.lowercase().startsWith(f)
    }
    return list.groupBy { it.letter }
        .entries
        .sortedBy { it.key }
        .map { it.key to it.value.map { c -> c.name } }
}
"@
$dst = 'c:\Users\wyf20\Desktop\app\android-native\app\src\main\java\com\travelguide\app\data\model\CitiesData.kt'
[System.IO.File]::WriteAllText($dst, $out, (New-Object System.Text.UTF8Encoding($false)))
Write-Host ("entries: " + $ms.Count)
