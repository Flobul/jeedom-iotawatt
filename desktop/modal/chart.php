<?php
/* This file is part of Jeedom.
 *
 * Jeedom is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Jeedom is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Jeedom. If not, see <http://www.gnu.org/licenses/>.
 */

if (!isConnect('admin')) {
    throw new Exception(__('401 - Accès non autorisé', __FILE__));
}

require_once __DIR__ . '/../../core/class/iotawatt.power.class.php';

// Initialisation des caches globaux
if (!isset($GLOBALS['hchp_tempo_cache'])) {
    $GLOBALS['hchp_tempo_cache'] = [];
}
if (!isset($GLOBALS['hchp_cache'])) {
    $GLOBALS['hchp_cache'] = [];
}

$startTime = microtime(true);
log::add('iotawatt', 'info', '=== Début génération graphique ===');

// Initialisation
$powerData = new IotawattPowerData();
$cmdArray = $powerData->collectData(false); // false = ne pas inclure le Linky

// Fonction de calcul précis des coûts EDF
function calculatePreciseCost($consumptionKwh, $periodDays = 1, $periodStart = null) {
    // Utiliser la date actuelle si non spécifiée
    if ($periodStart === null) {
        $periodStart = date('Y-m-d');
    }

    // Récupération de la configuration tarifaire
    $tariffType = config::byKey('tariffType', 'iotawatt', 'base');
    $subscribedPower = config::byKey('subscribedPower', 'iotawatt', 6);

    // Prix de l'énergie selon le type d'offre et la période (DÉJÀ EN TTC)
    $dayColor = ($tariffType === 'tempo') ? getTempoDayColor($periodStart) : null;
    $energyPrices = getEnergyPrices($tariffType, $periodStart, $dayColor);

    // Taxes sur abonnement uniquement
    $taxCTARate = config::byKey('taxCTA', 'iotawatt', 21.93) / 100;  // CTA en % de l'abonnement
    $taxTVA = config::byKey('taxTVA', 'iotawatt', 20) / 100;  // TVA 20%

    // Calcul du coût énergétique (tarifs EDF déjà TTC, incluent déjà accise + TVA)
    $energyCostTTC = calculateEnergyCost($consumptionKwh, $energyPrices, $tariffType, $periodStart);

    // Calcul de l'abonnement HT (proratisé selon la période)
    $subscriptionHT = getSubscriptionCost($tariffType, $subscribedPower) * ($periodDays / 30);
    
    // CTA sur l'abonnement HT
    $ctaCost = $subscriptionHT * $taxCTARate;
    
    // Total abonnement + CTA (HT)
    $subscriptionTotalHT = $subscriptionHT + $ctaCost;
    
    // TVA sur (abonnement + CTA)
    $subscriptionTVA = $subscriptionTotalHT * $taxTVA;
    
    // Abonnement TTC
    $subscriptionTTC = $subscriptionTotalHT + $subscriptionTVA;
    
    // Coût total TTC
    $totalCost = $energyCostTTC + $subscriptionTTC;

    return [
        'energy' => round($energyCostTTC, 4),  // Énergie TTC (inclut déjà accise + TVA)
        'subscription' => round($subscriptionTTC, 4),  // Abonnement TTC (inclut CTA + TVA)
        'subscription_ht' => round($subscriptionHT, 4),
        'cta' => round($ctaCost, 4),
        'subscription_tva' => round($subscriptionTVA, 4),
        'total' => round($totalCost, 4),
        'details' => [
            'tariff_type' => $tariffType,
            'consumption_kwh' => $consumptionKwh,
            'period_days' => $periodDays,
            'period_start' => $periodStart,
            'energy_prices' => $energyPrices
        ]
    ];
}

// Récupération des prix de l'énergie selon le type d'offre et la date
function getEnergyPrices($tariffType, $date = null, $dayColor = null) {
    // Utiliser la date actuelle si non spécifiée
    if ($date === null) {
        $date = date('Y-m-d');
    }

    // Tarifs EDF détaillés 2025 (source: PDF EDF - Tarifs TTC incluant déjà accise + TVA)
    $edfTariffs = [
        'base' => [
            '2025-08-01' => [
                3 => 0.1973, 6 => 0.1973, 9 => 0.1973, 12 => 0.1973,
                15 => 0.1973, 18 => 0.1973, 24 => 0.1973, 30 => 0.1973, 36 => 0.1973
            ]
        ],
        'hphc' => [
            '2025-08-01' => [
                'hp' => [6 => 0.2081, 9 => 0.2081, 12 => 0.2081, 15 => 0.2081, 18 => 0.2081, 24 => 0.2081, 30 => 0.2081, 36 => 0.2081],
                'hc' => [6 => 0.1635, 9 => 0.1635, 12 => 0.1635, 15 => 0.1635, 18 => 0.1635, 24 => 0.1635, 30 => 0.1635, 36 => 0.1635]
            ]
        ],
        'tempo' => [
            '2025-08-01' => [
                6 => [
                    'bleu' => ['hc' => 0.1232, 'hp' => 0.1494],
                    'blanc' => ['hc' => 0.1391, 'hp' => 0.1730],
                    'rouge' => ['hc' => 0.1460, 'hp' => 0.6468]
                ],
                9 => [
                    'bleu' => ['hc' => 0.1232, 'hp' => 0.1494],
                    'blanc' => ['hc' => 0.1391, 'hp' => 0.1730],
                    'rouge' => ['hc' => 0.1460, 'hp' => 0.6468]
                ],
                12 => [
                    'bleu' => ['hc' => 0.1232, 'hp' => 0.1494],
                    'blanc' => ['hc' => 0.1391, 'hp' => 0.1730],
                    'rouge' => ['hc' => 0.1460, 'hp' => 0.6468]
                ],
                15 => [
                    'bleu' => ['hc' => 0.1232, 'hp' => 0.1494],
                    'blanc' => ['hc' => 0.1391, 'hp' => 0.1730],
                    'rouge' => ['hc' => 0.1460, 'hp' => 0.6468]
                ],
                18 => [
                    'bleu' => ['hc' => 0.1232, 'hp' => 0.1494],
                    'blanc' => ['hc' => 0.1391, 'hp' => 0.1730],
                    'rouge' => ['hc' => 0.1460, 'hp' => 0.6468]
                ],
                24 => [
                    'bleu' => ['hc' => 0.1232, 'hp' => 0.1494],
                    'blanc' => ['hc' => 0.1391, 'hp' => 0.1730],
                    'rouge' => ['hc' => 0.1460, 'hp' => 0.6468]
                ],
                30 => [
                    'bleu' => ['hc' => 0.1232, 'hp' => 0.1494],
                    'blanc' => ['hc' => 0.1391, 'hp' => 0.1730],
                    'rouge' => ['hc' => 0.1460, 'hp' => 0.6468]
                ],
                36 => [
                    'bleu' => ['hc' => 0.1232, 'hp' => 0.1494],
                    'blanc' => ['hc' => 0.1391, 'hp' => 0.1730],
                    'rouge' => ['hc' => 0.1460, 'hp' => 0.6468]
                ]
            ]
        ]
    ];

    $subscribedPower = config::byKey('subscribedPower', 'iotawatt', 6);

    switch ($tariffType) {
        case 'base':
            $tariffDate = findClosestTariffDate($edfTariffs['base'], $date);
            return [
                'base' => $edfTariffs['base'][$tariffDate][$subscribedPower] ?? 0.1973,
                'date' => $tariffDate,
                'power' => $subscribedPower
            ];

        case 'hphc':
            $hcPercentage = config::byKey('hcPercentage', 'iotawatt', 33) / 100;
            $tariffDate = findClosestTariffDate($edfTariffs['hphc'], $date);
            return [
                'hp' => $edfTariffs['hphc'][$tariffDate]['hp'][$subscribedPower] ?? 0.2081,
                'hc' => $edfTariffs['hphc'][$tariffDate]['hc'][$subscribedPower] ?? 0.1635,
                'hc_percentage' => $hcPercentage,
                'date' => $tariffDate,
                'power' => $subscribedPower
            ];

        case 'tempo':
            // Utiliser les prix configurés par l'utilisateur ou valeurs par défaut
            $hcBlue = config::byKey('priceTempoHCBlue', 'iotawatt', 0.1232);
            $hcWhite = config::byKey('priceTempoHCWhite', 'iotawatt', 0.1391);
            $hcRed = config::byKey('priceTempoHCRed', 'iotawatt', 0.1460);
            $hpBlue = config::byKey('priceTempoHPBlue', 'iotawatt', 0.1494);
            $hpWhite = config::byKey('priceTempoHPWhite', 'iotawatt', 0.1730);
            $hpRed = config::byKey('priceTempoHPRed', 'iotawatt', 0.6468);

            if (!$dayColor) {
                $dayColor = 'bleu';
            }

            switch ($dayColor) {
                case 'bleu':
                    return [
                        'hc' => $hcBlue,
                        'hp' => $hpBlue,
                        'day_color' => $dayColor,
                        'date' => date('Y-m-d'),
                        'power' => $subscribedPower
                    ];
                case 'blanc':
                    return [
                        'hc' => $hcWhite,
                        'hp' => $hpWhite,
                        'day_color' => $dayColor,
                        'date' => date('Y-m-d'),
                        'power' => $subscribedPower
                    ];
                case 'rouge':
                    return [
                        'hc' => $hcRed,
                        'hp' => $hpRed,
                        'day_color' => $dayColor,
                        'date' => date('Y-m-d'),
                        'power' => $subscribedPower
                    ];
                default:
                    return [
                        'hc' => $hcBlue,
                        'hp' => $hpBlue,
                        'day_color' => 'bleu',
                        'date' => date('Y-m-d'),
                        'power' => $subscribedPower
                    ];
            }

        default:
            return [
                'base' => 0.1973,
                'date' => date('Y-m-d')
            ];
    }
}

// Fonction pour trouver la date de tarif la plus proche
function findClosestTariffDate($tariffDates, $targetDate) {
    $targetTimestamp = strtotime($targetDate);
    $closestDate = null;
    $closestDiff = PHP_INT_MAX;

    foreach (array_keys($tariffDates) as $date) {
        $diff = abs(strtotime($date) - $targetTimestamp);
        if ($diff < $closestDiff) {
            $closestDiff = $diff;
            $closestDate = $date;
        }
    }

    return $closestDate ?: array_key_first($tariffDates);
}

// Calcul du coût énergétique selon le type d'offre et la date
function calculateEnergyCost($consumptionKwh, $prices, $tariffType, $date = null, $cmdId = null) {
    if ($date === null) {
        $date = date('Y-m-d');
    }

    switch ($tariffType) {
        case 'base':
            return $consumptionKwh * $prices['base'];

        case 'hphc':
            if ($cmdId) {
                // Calcul précis basé sur les données horaires
                $hcHours = config::byKey('hcHours', 'iotawatt', '22h00-6h00');
                $hchpData = calculatePreciseHCHPConsumption($cmdId, $date, $hcHours);

                if ($hchpData['total'] > 0) {
                    return ($hchpData['hc'] * $prices['hc']) + ($hchpData['hp'] * $prices['hp']);
                }
            }
            // Fallback vers estimation
            $hcHours = config::byKey('hcHours', 'iotawatt', '22h00-6h00');
            $hcPercentage = calculateHCPercentage($hcHours, $date);
            $hcConsumption = $consumptionKwh * $hcPercentage;
            $hpConsumption = $consumptionKwh * (1 - $hcPercentage);
            return ($hcConsumption * $prices['hc']) + ($hpConsumption * $prices['hp']);

        case 'tempo':
            if ($cmdId) {
                // Calcul précis basé sur les données horaires avec logique Tempo
                $hchpData = calculatePreciseHCHPTempoConsumption($cmdId, $date, $prices['day_color'] ?? 'bleu');

                if ($hchpData['total'] > 0) {
                    // Les données horaires sont déjà en kWh
                    $result = ($hchpData['hc'] * $prices['hc']) + ($hchpData['hp'] * $prices['hp']);
                    return $result;
                }
            }
            // Fallback vers estimation
            $hcConsumption = $consumptionKwh * 0.20; // Estimation HC
            $hpConsumption = $consumptionKwh * 0.80; // Estimation HP
            $result = ($hcConsumption * $prices['hc']) + ($hpConsumption * $prices['hp']);
            return $result;

        default:
            return $consumptionKwh * $prices['base'];
    }
}

// Calcul du pourcentage heures creuses basé sur les heures configurées
function calculateHCPercentage($hcHours, $date) {
    // Analyse des heures creuses (format: "22h00-6h00,12h00-14h00")
    $hcRanges = explode(',', $hcHours);
    $totalHCDuration = 0;

    foreach ($hcRanges as $range) {
        $times = explode('-', trim($range));
        if (count($times) == 2) {
            $start = strtotime($times[0]);
            $end = strtotime($times[1]);

            if ($end < $start) { // Passage minuit
                $end += 86400; // +24h
            }

            $duration = ($end - $start) / 3600; // en heures
            $totalHCDuration += $duration;
        }
    }

    return min($totalHCDuration / 24, 1.0); // Pourcentage du jour en HC
}

// Calcule précisément les consommations HC et HP pour une journée
function calculatePreciseHCHPConsumption($cmdId, $date, $hcHours) {
    // Vérifier le cache d'abord
    $cacheKey = $cmdId . '_' . $date . '_' . md5($hcHours);
    if (isset($GLOBALS['hchp_cache'][$cacheKey])) {
        return $GLOBALS['hchp_cache'][$cacheKey];
    }

    $cmd = cmd::byId($cmdId);
    if (!is_object($cmd)) {
        return ['hc' => 0, 'hp' => 0, 'total' => 0];
    }

    // Récupérer les données horaires de la journée
    $startDate = $date . ' 00:00:00';
    $endDate = $date . ' 23:59:59';
    $history = $cmd->getHistory($startDate, $endDate);

    if (empty($history)) {
        return ['hc' => 0, 'hp' => 0, 'total' => 0];
    }

    // Trier les données par heure
    $hourlyData = [];
    foreach ($history as $record) {
        $hour = date('H', strtotime($record->getDatetime()));
        $hourlyData[$hour] = $record->getValue();
    }

    // Analyser les plages HC
    $hcRanges = explode(',', $hcHours);
    $hcHoursArray = [];

    foreach ($hcRanges as $range) {
        $times = explode('-', trim($range));
        if (count($times) == 2) {
            // Extraire l'heure directement de la chaîne (format: "22h00")
            preg_match('/(\d+)h/', $times[0], $startMatch);
            preg_match('/(\d+)h/', $times[1], $endMatch);

            if ($startMatch && $endMatch) {
                $startHour = (int)$startMatch[1];
                $endHour = (int)$endMatch[1];

                if ($endHour < $startHour) { // Passage minuit
                    // Heures de startHour à 23
                    for ($h = $startHour; $h <= 23; $h++) {
                        $hcHoursArray[] = $h;
                    }
                    // Heures de 0 à endHour
                    for ($h = 0; $h <= $endHour; $h++) {
                        $hcHoursArray[] = $h;
                    }
                } else {
                    for ($h = $startHour; $h < $endHour; $h++) {
                        $hcHoursArray[] = $h;
                    }
                }
            }
        }
    }

    // Calculer les consommations HC et HP
    $hcConsumption = 0;
    $hpConsumption = 0;
    $previousValue = null;
    $previousHour = null;

    ksort($hourlyData);

    foreach ($hourlyData as $hour => $value) {
        if ($previousValue !== null) {
            $consumption = $value - $previousValue;
            if ($consumption > 0) { // Éviter les valeurs négatives (remise à zéro compteur)
                // Convertir en kWh si l'unité est Wh
                if ($cmd->getUnite() == 'Wh') {
                    $consumption = $consumption / 1000;
                }
                if (in_array($previousHour, $hcHoursArray)) {
                    $hcConsumption += $consumption;
                } else {
                    $hpConsumption += $consumption;
                }
            }
        }
        $previousValue = $value;
        $previousHour = $hour;
    }

    $result = [
        'hc' => round($hcConsumption, 3),
        'hp' => round($hpConsumption, 3),
        'total' => round($hcConsumption + $hpConsumption, 3)
    ];
    
    // Mettre en cache le résultat
    $GLOBALS['hchp_cache'][$cacheKey] = $result;
    return $result;
}

function calculatePreciseHCHPTempoConsumption($cmdId, $date, $dayColor) {
    // Vérifier le cache d'abord
    $cacheKey = 'tempo_' . $cmdId . '_' . $date . '_' . $dayColor;
    if (isset($GLOBALS['hchp_tempo_cache'][$cacheKey])) {
        return $GLOBALS['hchp_tempo_cache'][$cacheKey];
    }

    $cmd = cmd::byId($cmdId);
    if (!is_object($cmd)) {
        return [
            'hc' => 0, 'hp' => 0, 'total' => 0,
            'details' => []
        ];
    }

    // Récupérer les données horaires de la journée
    $startDate = $date . ' 00:00:00';
    $endDate = $date . ' 23:59:59';
    $history = $cmd->getHistory($startDate, $endDate);

    if (empty($history)) {
        return [
            'hc' => 0, 'hp' => 0, 'total' => 0,
            'details' => []
        ];
    }

    // Trier les données par heure
    $hourlyData = [];
    foreach ($history as $record) {
        $hour = date('H', strtotime($record->getDatetime()));
        $hourlyData[$hour] = $record->getValue();
    }

    // Déterminer le jour de la semaine (0=dimanche, 1=lundi, ..., 6=samedi)
    $dayOfWeek = date('w', strtotime($date));
    $isWeekend = ($dayOfWeek == 0 || $dayOfWeek == 6);

    // Récupérer les couleurs Tempo pour ce jour ET le jour suivant (pour transition à 6h)
    // IMPORTANT: L'API Tempo retourne la couleur valable de 6h J à 6h J+1
    // Donc pour un jour calendaire J (0h-24h), on a:
    // - 0h-6h: couleur de J-1 (retournée par l'API pour J-1)
    // - 6h-24h: couleur de J (retournée par l'API pour J)
    
    $colorToday = getTempoDayColor($date);  // Couleur valable de 6h ce jour à 6h demain
    $yesterday = date('Y-m-d', strtotime($date . ' -1 day'));
    $colorYesterday = getTempoDayColor($yesterday);  // Couleur valable de 6h hier à 6h aujourd'hui
    
    // Pour la journée calendaire, on a donc:
    // - Période 0h-6h: couleur de la veille (colorYesterday)
    // - Période 6h-24h: couleur du jour (colorToday)
    $hasTransition = ($colorYesterday !== $colorToday);
    
    // Calculer les consommations par période de couleur
    $periods = [];
    
    if ($hasTransition) {
        // Période 1: 0h-6h avec la couleur de la veille
        $periods[] = [
            'color' => $colorYesterday,
            'hours' => range(0, 5),
            'hc' => 0,
            'hp' => 0
        ];
        // Période 2: 6h-24h avec la couleur du jour
        $periods[] = [
            'color' => $colorToday,
            'hours' => range(6, 23),
            'hc' => 0,
            'hp' => 0
        ];
    } else {
        // Une seule période sur toute la journée (même couleur)
        $periods[] = [
            'color' => $colorToday,
            'hours' => range(0, 23),
            'hc' => 0,
            'hp' => 0
        ];
    }
    
    // Récupérer la configuration des horaires HC/HP pour Tempo
    $tempoHCWeekday = config::byKey('tempoHCWeekday', 'iotawatt', '22h00-6h00');
    $tempoHCWeekend = config::byKey('tempoHCWeekend', 'iotawatt', '0h00-24h00');
    $tempoRedDayMode = config::byKey('tempoRedDayMode', 'iotawatt', 'same'); // 'same' ou 'allhp'
    
    // Parser les plages horaires HC
    $parseHCRanges = function($hcRangesStr) {
        $hcHoursArray = [];
        if (empty($hcRangesStr)) {
            // Si vide, tout en HC (week-end typique)
            return range(0, 23);
        }
        
        $ranges = explode(',', $hcRangesStr);
        foreach ($ranges as $range) {
            $range = trim($range);
            if (preg_match('/(\d+)h(\d+)-(\d+)h(\d+)/', $range, $matches)) {
                $startHour = intval($matches[1]);
                $startMin = intval($matches[2]);
                $endHour = intval($matches[3]);
                $endMin = intval($matches[4]);
                
                // Convertir en heures (arrondi)
                $start = $startHour + ($startMin >= 30 ? 1 : 0);
                $end = $endHour + ($endMin >= 30 ? 1 : 0);
                
                if ($start < $end) {
                    // Plage normale (ex: 13h-15h)
                    for ($h = $start; $h < $end; $h++) {
                        if (!in_array($h, $hcHoursArray)) {
                            $hcHoursArray[] = $h;
                        }
                    }
                } else {
                    // Plage qui traverse minuit (ex: 22h-6h)
                    for ($h = $start; $h < 24; $h++) {
                        if (!in_array($h, $hcHoursArray)) {
                            $hcHoursArray[] = $h;
                        }
                    }
                    for ($h = 0; $h < $end; $h++) {
                        if (!in_array($h, $hcHoursArray)) {
                            $hcHoursArray[] = $h;
                        }
                    }
                }
            }
        }
        return $hcHoursArray;
    };
    
    // Déterminer les heures HC selon le jour et la couleur
    $getHCHours = function($isWeekend, $color) use ($tempoHCWeekday, $tempoHCWeekend, $tempoRedDayMode, $parseHCRanges) {
        // Pour les jours rouges en mode "tout HP"
        if ($color === 'rouge' && $tempoRedDayMode === 'allhp') {
            return []; // Aucune heure creuse
        }
        
        // Sinon, utiliser les horaires configurés
        if ($isWeekend) {
            return $parseHCRanges($tempoHCWeekend);
        } else {
            return $parseHCRanges($tempoHCWeekday);
        }
    };
    
    // Pour chaque période, calculer HC/HP selon la couleur et le jour
    $totalHC = 0;
    $totalHP = 0;
    $previousValue = null;
    $previousHour = null;

    ksort($hourlyData);

    foreach ($hourlyData as $hour => $value) {
        if ($previousValue !== null) {
            $consumption = $value - $previousValue;
            if ($consumption > 0) {
                // Convertir en kWh si l'unité est Wh
                if ($cmd->getUnite() == 'Wh') {
                    $consumption = $consumption / 1000;
                }
                
                // Déterminer dans quelle période se trouve cette heure
                foreach ($periods as &$period) {
                    if (in_array($previousHour, $period['hours'])) {
                        // Obtenir les heures HC pour cette période
                        $hcHours = $getHCHours($isWeekend, $period['color']);
                        $isHC = in_array($previousHour, $hcHours);
                        
                        if ($isHC) {
                            $period['hc'] += $consumption;
                            $totalHC += $consumption;
                        } else {
                            $period['hp'] += $consumption;
                            $totalHP += $consumption;
                        }
                        break;
                    }
                }
            }
        }
        $previousValue = $value;
        $previousHour = $hour;
    }

    $result = [
        'hc' => round($totalHC, 3),
        'hp' => round($totalHP, 3),
        'total' => round($totalHC + $totalHP, 3),
        'details' => $periods  // Détails par période de couleur
    ];
    
    // Mettre en cache le résultat
    $cacheKey = 'tempo_' . $cmdId . '_' . $date . '_' . $dayColor;
    $GLOBALS['hchp_tempo_cache'][$cacheKey] = $result;
    return $result;
}

// Fonction de répartition HC/HP basée sur la consommation totale du jour
function calculateHCHPRepartition($totalConsumptionKwh, $date, $tariffType, $dayColor = null) {
    $dayOfWeek = date('w', strtotime($date));
    $isWeekend = ($dayOfWeek == 0 || $dayOfWeek == 6);
    
    if ($tariffType === 'tempo') {
        if ($dayColor === 'rouge') {
            // Jour rouge : 100% HP (tarif HP toute la journée)
            error_log("[calculateHCHPRepartition] Jour ROUGE détecté → 100% HP");
            return [
                'hc' => 0,
                'hp' => $totalConsumptionKwh,
                'hc_percent' => 0,
                'hp_percent' => 100
            ];
        } else {
            // Jours bleu/blanc : HC 22h-6h = 8h/24h = 33.33%, HP 6h-22h = 16h/24h = 66.67%
            // Appliqué TOUS LES JOURS (semaine + week-end)
            $hcPercent = 33.33;
            $hpPercent = 66.67;
            $logType = $isWeekend ? "WEEK-END" : "SEMAINE";
            error_log("[calculateHCHPRepartition] Jour $logType ($dayColor) → HC: $hcPercent%, HP: $hpPercent%");
            return [
                'hc' => round($totalConsumptionKwh * $hcPercent / 100, 3),
                'hp' => round($totalConsumptionKwh * $hpPercent / 100, 3),
                'hc_percent' => $hcPercent,
                'hp_percent' => $hpPercent
            ];
        }
    } else if ($tariffType === 'hphc') {
        // HC/HP standard
        $hcHours = config::byKey('hcHours', 'iotawatt', '22h00-6h00');
        $hcPercent = calculateHCPercentage($hcHours, $date) * 100;
        $hpPercent = 100 - $hcPercent;
        return [
            'hc' => round($totalConsumptionKwh * $hcPercent / 100, 3),
            'hp' => round($totalConsumptionKwh * $hpPercent / 100, 3),
            'hc_percent' => $hcPercent,
            'hp_percent' => $hpPercent
        ];
    } else {
        // Tarif base
        return [
            'hc' => 0,
            'hp' => $totalConsumptionKwh,
            'hc_percent' => 0,
            'hp_percent' => 100
        ];
    }
}

// Fonction pour calculer les consommations HC/HP réelles depuis l'historique
function calculateRealHCHPFromHistory($cmdId, $date, $tariffType) {
    $cmd = cmd::byId($cmdId);
    if (!is_object($cmd)) {
        return ['hc' => 0, 'hp' => 0, 'total' => 0];
    }
    
    // Récupérer l'historique du jour complet
    $startDate = $date . ' 00:00:00';
    $endDate = $date . ' 23:59:59';
    $history = $cmd->getHistory($startDate, $endDate);
    
    if (empty($history)) {
        return ['hc' => 0, 'hp' => 0, 'total' => 0];
    }
    
    // Calculer la consommation totale du jour (max global - min global)
    $allValues = [];
    foreach ($history as $record) {
        $allValues[] = $record->getValue();
    }
    
    if (empty($allValues)) {
        return ['hc' => 0, 'hp' => 0, 'total' => 0];
    }
    
    $totalConsumption = max($allValues) - min($allValues);
    
    // Convertir en kWh si l'unité est Wh
    if ($cmd->getUnite() == 'Wh') {
        $totalConsumption = $totalConsumption / 1000;
    }
    
    // Définir les plages horaires HC
    $hcHours = config::byKey('hcHours', 'iotawatt', '22h00-6h00');
    
    // Parser les heures HC (format: "22h00-6h00" ou "22:00-6:00")
    $hcHours = str_replace('h', ':', $hcHours);
    list($hcStart, $hcEnd) = explode('-', $hcHours);
    list($hcStartH, $hcStartM) = explode(':', $hcStart);
    list($hcEndH, $hcEndM) = explode(':', $hcEnd);
    
    $hcStartMinutes = intval($hcStartH) * 60 + intval($hcStartM);
    $hcEndMinutes = intval($hcEndH) * 60 + intval($hcEndM);
    
    // Calculer les variations de consommation par période pour répartir le total
    $hcDelta = 0;
    $hpDelta = 0;
    $previousValue = null;
    $previousTime = null;
    $previousIsHC = null;
    
    foreach ($history as $record) {
        $datetime = $record->getDatetime();
        $hour = intval(date('H', strtotime($datetime)));
        $minute = intval(date('i', strtotime($datetime)));
        $timeInMinutes = $hour * 60 + $minute;
        $value = $record->getValue();
        
        // Déterminer si l'heure est en HC ou HP
        $isHC = false;
        if ($hcEndMinutes < $hcStartMinutes) {
            // Plage qui traverse minuit (ex: 22h-6h)
            $isHC = ($timeInMinutes >= $hcStartMinutes || $timeInMinutes < $hcEndMinutes);
        } else {
            // Plage normale (ex: 2h-8h)
            $isHC = ($timeInMinutes >= $hcStartMinutes && $timeInMinutes < $hcEndMinutes);
        }
        
        // Calculer la variation depuis la mesure précédente
        if ($previousValue !== null) {
            $delta = $value - $previousValue;
            if ($delta > 0) {
                // Répartir la variation selon la période (on prend la période de la mesure actuelle)
                if ($isHC) {
                    $hcDelta += $delta;
                } else {
                    $hpDelta += $delta;
                }
            }
        }
        
        $previousValue = $value;
        $previousTime = $timeInMinutes;
        $previousIsHC = $isHC;
    }
    
    // Convertir les deltas en kWh si nécessaire
    if ($cmd->getUnite() == 'Wh') {
        $hcDelta = $hcDelta / 1000;
        $hpDelta = $hpDelta / 1000;
    }
    
    $totalDelta = $hcDelta + $hpDelta;
    
    // Répartir la consommation totale proportionnellement aux deltas observés
    $hcConsumption = 0;
    $hpConsumption = 0;
    
    if ($totalDelta > 0) {
        $hcConsumption = $totalConsumption * ($hcDelta / $totalDelta);
        $hpConsumption = $totalConsumption * ($hpDelta / $totalDelta);
    } else {
        // Si pas de variation positive détectée, utiliser une répartition par défaut
        $hcConsumption = 0;
        $hpConsumption = $totalConsumption;
    }
    
    return [
        'hc' => round($hcConsumption, 3),
        'hp' => round($hpConsumption, 3),
        'total' => round($totalConsumption, 3),
        'hc_percent' => $totalConsumption > 0 ? round(($hcConsumption / $totalConsumption) * 100, 1) : 0,
        'hp_percent' => $totalConsumption > 0 ? round(($hpConsumption / $totalConsumption) * 100, 1) : 0
    ];
}

// Cache global pour les calculs Tempo HC/HP
if (!isset($GLOBALS['hchp_tempo_cache'])) {
    $GLOBALS['hchp_tempo_cache'] = [];
}
if (!isset($GLOBALS['hchp_cache'])) {
    $GLOBALS['hchp_cache'] = [];
}

// Simulation des jours Tempo (utilise l'API officielle)
function getTempoDayColor($date) {
    // Cache pour éviter les appels répétés
    static $tempoCache = [];

    if (isset($tempoCache[$date])) {
        return $tempoCache[$date];
    }

    try {
        // API Tempo officielle
        $apiUrl = 'https://www.api-couleur-tempo.fr/api/joursTempo';
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => 'Accept: application/json',
                'timeout' => 5
            ]
        ]);

        $response = file_get_contents($apiUrl, false, $context);
        if ($response === false) {
            throw new Exception(__('API Tempo indisponible', __FILE__));
        }

        $data = json_decode($response, true);
        if (!$data || !is_array($data)) {
            throw new Exception(__('Données Tempo invalides', __FILE__));
        }

        // Convertir la date en format YYYY-MM-DD
        $formattedDate = date('Y-m-d', strtotime($date));

        // Chercher la couleur pour cette date dans le tableau
        foreach ($data as $jour) {
            if (isset($jour['dateJour']) && $jour['dateJour'] === $formattedDate) {
                $color = strtolower($jour['libCouleur']);
                $tempoCache[$date] = $color;
                return $color;
            }
        }

        // Si pas trouvé, essayer la date d'aujourd'hui comme fallback
        $today = date('Y-m-d');
        foreach ($data as $jour) {
            if (isset($jour['dateJour']) && $jour['dateJour'] === $today) {
                $color = strtolower($jour['libCouleur']);
                $tempoCache[$date] = $color;
                return $color;
            }
        }
        
        // Si toujours pas trouvé, utiliser bleu par défaut
        throw new Exception(__('Date non trouvée', __FILE__));

    } catch (Exception $e) {
        // Fallback vers simulation simplifiée
        $timestamp = strtotime($date);
        $dayOfWeek = date('N', $timestamp);
        $dayOfMonth = date('j', $timestamp);

        if ($dayOfWeek >= 6 || in_array($dayOfMonth, [15, 30])) {
            return 'rouge';
        } elseif ($dayOfWeek == 5 || in_array($dayOfMonth, [10, 20, 25])) {
            return 'blanc';
        } else {
            return 'bleu';
        }
    }
}

// Récupération du coût d'abonnement selon le type d'offre et la puissance
function getSubscriptionCost($tariffType, $subscribedPower) {
    // Tarifs d'abonnement EDF 2025 (mensuels TTC - source: JC144/EDF_Simulateur_Prix)
    $subscriptionRates = [
        'base' => [
            3 => 11.73, 6 => 15.47, 9 => 19.39, 12 => 23.32, 15 => 27.06,
            18 => 30.76, 24 => 38.79, 30 => 46.44, 36 => 54.29
        ],
        'hphc' => [
            6 => 15.74, 9 => 19.81, 12 => 23.76, 15 => 27.49, 18 => 31.34,
            24 => 39.47, 30 => 47.02, 36 => 54.61
        ],
        'tempo' => [
            6 => 15.50, 9 => 19.49, 12 => 23.38, 15 => 27.01, 18 => 30.79,
            24 => 38.79, 30 => 46.31, 36 => 54.43
        ]
    ];

    if (!isset($subscriptionRates[$tariffType][$subscribedPower])) {
        // Valeur par défaut si la puissance n'est pas trouvée
        return $subscriptionRates['base'][6];
    }

    return $subscriptionRates[$tariffType][$subscribedPower];
}

// Nombre de jours à afficher (par défaut depuis config ou 7)
$defaultDays = config::byKey('chartDefaultPeriod', 'iotawatt', 7);
$nbDays = init('days', $defaultDays);
$nbDays = max($nbDays, 1); // Minimum 1 jour, pas de limite max

// Déterminer le mode d'agrégation selon la période
if ($nbDays <= 31) {
    $aggregationMode = 'daily';
} elseif ($nbDays <= 365) {
    $aggregationMode = 'monthly';
} else {
    $aggregationMode = 'yearly';
}

// Type de graphique (par défaut depuis config ou pie)
$defaultType = config::byKey('chartDefaultType', 'iotawatt', 'pie');
$chartType = init('type', $defaultType);

// Type de tri (par défaut depuis config ou consumption-desc)
$defaultSort = config::byKey('chartDefaultSort', 'iotawatt', 'consumption-desc');
$sortType = init('sort', $defaultSort);

/**
 * Génère une couleur aléatoire mais agréable
 * @param int $index
 * @return array [r, g, b, alpha]
 */
function generateColor($index) {
    $colors = [
        [54, 162, 235],   // Bleu
        [255, 99, 132],   // Rouge
        [75, 192, 192],   // Cyan
        [255, 206, 86],   // Jaune
        [153, 102, 255],  // Violet
        [255, 159, 64],   // Orange
        [199, 199, 199],  // Gris
        [83, 102, 255],   // Indigo
        [255, 99, 255],   // Rose
        [99, 255, 132],   // Vert clair
    ];
    
    $colorIndex = $index % count($colors);
    return $colors[$colorIndex];
}

/**
 * Récupère les données de consommation pour TOUTES les entrées en une seule requête optimisée
 * Avec agrégation automatique selon la période (jour/mois/année)
 * @param array $cmdArray
 * @param int $nbDays
 * @param string $aggregationMode 'daily', 'monthly' ou 'yearly'
 * @return array
 */
function getAllConsumptionData($cmdArray, $nbDays, $aggregationMode = 'daily') {
    $allData = [];

    // Grouper les requêtes par période pour optimiser
    $startDate = date('Y-m-d 00:00:00', strtotime("-" . ($nbDays - 1) . " days"));
    $endDate = date('Y-m-d 23:59:59');

    foreach ($cmdArray as $key => $equipment) {
        if (empty($equipment['consoId'])) {
            continue;
        }

        $cmd = cmd::byId($equipment['consoId']);
        if (!is_object($cmd)) {
            continue;
        }

        // Récupérer toutes les données d'un coup au lieu de jour par jour
        $history = $cmd->getHistory($startDate, $endDate);
        $dailyData = [];

        // Grouper par jour
        $dayStats = [];
        foreach ($history as $record) {
            $day = date('Y-m-d', strtotime($record->getDatetime()));
            if (!isset($dayStats[$day])) {
                $dayStats[$day] = ['min' => null, 'max' => null, 'values' => []];
            }
            $value = $record->getValue();
            $dayStats[$day]['values'][] = $value;
            if ($dayStats[$day]['min'] === null || $value < $dayStats[$day]['min']) {
                $dayStats[$day]['min'] = $value;
            }
            if ($dayStats[$day]['max'] === null || $value > $dayStats[$day]['max']) {
                $dayStats[$day]['max'] = $value;
            }
        }

        // Calculer la consommation par jour
        $dailyConsumption = [];
        for ($i = $nbDays - 1; $i >= 0; $i--) {
            $date = date('Y-m-d', strtotime("-$i days"));
            $consumption = 0;

            if (isset($dayStats[$date]['max']) && isset($dayStats[$date]['min'])) {
                $consumption = $dayStats[$date]['max'] - $dayStats[$date]['min'];
                // Convertir en kWh si l'unité est Wh
                if ($cmd->getUnite() == 'Wh') {
                    $consumption = $consumption / 1000;
                }
            }

            $dailyConsumption[$date] = round($consumption, 2);
        }

        // Agrégation selon le mode
        if ($aggregationMode === 'monthly') {
            // Agréger par mois
            $monthlyData = [];
            foreach ($dailyConsumption as $date => $value) {
                $month = date('Y-m', strtotime($date));
                if (!isset($monthlyData[$month])) {
                    $monthlyData[$month] = 0;
                }
                $monthlyData[$month] += $value;
            }
            
            foreach ($monthlyData as $month => $value) {
                $dailyData[] = [
                    'date' => $month . '-01',
                    'value' => round($value, 2),
                    'period' => $month
                ];
            }
        } elseif ($aggregationMode === 'yearly') {
            // Agréger par année
            $yearlyData = [];
            foreach ($dailyConsumption as $date => $value) {
                $year = date('Y', strtotime($date));
                if (!isset($yearlyData[$year])) {
                    $yearlyData[$year] = 0;
                }
                $yearlyData[$year] += $value;
            }
            
            foreach ($yearlyData as $year => $value) {
                $dailyData[] = [
                    'date' => $year . '-01-01',
                    'value' => round($value, 2),
                    'period' => $year
                ];
            }
        } else {
            // Mode daily (par défaut)
            foreach ($dailyConsumption as $date => $value) {
                $dailyData[] = [
                    'date' => $date,
                    'value' => $value
                ];
            }
        }

        if (!empty($dailyData)) {
            $allData[$equipment['consoId']] = $dailyData;
        }
    }

    return $allData;
}

// Récupérer TOUTES les données en une seule passe optimisée
$allConsumptionData = getAllConsumptionData($cmdArray, $nbDays, $aggregationMode);

// Préparer les données pour le graphique
$chartData = [
    'labels' => [],
    'datasets' => [],
    'cmdIds' => [] // Pour mapper les datasets aux cmd_id
];

$datasetIndex = 0;
foreach ($cmdArray as $key => $equipment) {
    
    // Ignorer les entrées sans consommation
    if (empty($equipment['consoId']) || !isset($allConsumptionData[$equipment['consoId']])) {
        continue;
    }

    $consumptionData = $allConsumptionData[$equipment['consoId']];

    // Remplir les labels (dates) une seule fois
    if (empty($chartData['labels'])) {
        foreach ($consumptionData as $dayData) {
            if ($aggregationMode === 'monthly') {
                $chartData['labels'][] = date('m/Y', strtotime($dayData['date']));
            } elseif ($aggregationMode === 'yearly') {
                $chartData['labels'][] = date('Y', strtotime($dayData['date']));
            } else {
                $chartData['labels'][] = date('d/m', strtotime($dayData['date']));
            }
        }
    }

    // Préparer les données pour ce dataset
    $values = [];
    foreach ($consumptionData as $dayData) {
        $values[] = $dayData['value'];
    }

    // Vérifier si on a au moins une valeur non-nulle
    if (array_sum($values) == 0) {
        continue; // Skip empty datasets
    }

    // Couleur pour cette entrée
    $color = generateColor($datasetIndex);

    // Nom de l'entrée
    $name = $equipment['consoName'] ?? $equipment['eqName'] ?? __('Entrée', __FILE__) . ' ' . $datasetIndex;
    $name = strip_tags($name);
    $name = str_replace(['Consommation', 'Puissance'], '', $name);
    $name = trim($name);

    // Ajouter le dataset
    $chartData['datasets'][] = [
        'label' => $name,
        'data' => $values,
        'backgroundColor' => sprintf('rgba(%d, %d, %d, 0.7)', $color[0], $color[1], $color[2]),
        'borderColor' => sprintf('rgba(%d, %d, %d, 1)', $color[0], $color[1], $color[2]),
        'borderWidth' => 1
    ];

    // Stocker le cmd_id correspondant
    $chartData['cmdIds'][] = $equipment['consoId'];

    $datasetIndex++;
}

// Trier les datasets selon le type de tri sélectionné
$sortParts = explode('-', $sortType);
$sortField = $sortParts[0] ?? 'cmd';
$sortOrder = $sortParts[1] ?? 'asc';

if ($sortField === 'consumption') {
    // Trier par consommation totale
    usort($chartData['datasets'], function($a, $b) use ($sortOrder) {
        $totalA = array_sum($a['data']);
        $totalB = array_sum($b['data']);
        $result = $totalA - $totalB; // Croissant par défaut
        return $sortOrder === 'desc' ? -$result : $result;
    });
} elseif ($sortField === 'peak') {
    // Trier par pic de consommation
    usort($chartData['datasets'], function($a, $b) use ($sortOrder) {
        $peakA = max($a['data']);
        $peakB = max($b['data']);
        $result = $peakA - $peakB; // Croissant par défaut
        return $sortOrder === 'desc' ? -$result : $result;
    });
} elseif ($sortField === 'efficiency') {
    // Trier par efficacité (consommation moyenne / pic)
    usort($chartData['datasets'], function($a, $b) use ($sortOrder) {
        $totalA = array_sum($a['data']);
        $peakA = max($a['data']);
        $efficiencyA = $peakA > 0 ? $totalA / $peakA : 0;

        $totalB = array_sum($b['data']);
        $peakB = max($b['data']);
        $efficiencyB = $peakB > 0 ? $totalB / $peakB : 0;

        $result = $efficiencyA - $efficiencyB; // Croissant par défaut
        return $sortOrder === 'desc' ? -$result : $result;
    });
} elseif ($sortField === 'cost') {
    // Trier par coût estimé précis (calcul complet EDF)
    usort($chartData['datasets'], function($a, $b) use ($sortOrder, $nbDays) {
        $totalKwhA = array_sum($a['data']); // Déjà en kWh
        $totalKwhB = array_sum($b['data']); // Déjà en kWh

        $costA = calculatePreciseCost($totalKwhA, $nbDays)['total'];
        $costB = calculatePreciseCost($totalKwhB, $nbDays)['total'];

        $result = $costA - $costB; // Croissant par défaut
        return $sortOrder === 'desc' ? -$result : $result;
    });
} elseif ($sortField === 'usage') {
    // Trier par modèle d'usage (coefficient de variation)
    usort($chartData['datasets'], function($a, $b) use ($sortOrder) {
        $dataA = array_filter($a['data'], function($val) { return $val > 0; });
        $dataB = array_filter($b['data'], function($val) { return $val > 0; });

        $meanA = count($dataA) > 0 ? array_sum($dataA) / count($dataA) : 0;
        $meanB = count($dataB) > 0 ? array_sum($dataB) / count($dataB) : 0;

        $varianceA = 0;
        $varianceB = 0;

        foreach ($dataA as $val) {
            $varianceA += pow($val - $meanA, 2);
        }
        foreach ($dataB as $val) {
            $varianceB += pow($val - $meanB, 2);
        }

        $stdDevA = count($dataA) > 1 ? sqrt($varianceA / (count($dataA) - 1)) : 0;
        $stdDevB = count($dataB) > 1 ? sqrt($varianceB / (count($dataB) - 1)) : 0;

        $cvA = $meanA > 0 ? $stdDevA / $meanA : 0; // Coefficient de variation
        $cvB = $meanB > 0 ? $stdDevB / $meanB : 0; // Coefficient de variation

        $result = $cvA - $cvB; // Croissant par défaut (plus régulier = plus petit CV)
        return $sortOrder === 'desc' ? -$result : $result;
    });
} elseif ($sortField === 'equipment') {
    // Trier par nom d'entrée (utilise le label pour l'instant)
    usort($chartData['datasets'], function($a, $b) use ($sortOrder) {
        $result = strcasecmp($a['label'], $b['label']);
        return $sortOrder === 'desc' ? -$result : $result;
    });
} elseif ($sortField === 'cmd') {
    // Trier par nom de commande (utilise le nom de l'entrée pour l'instant)
    usort($chartData['datasets'], function($a, $b) use ($sortOrder) {
        $result = strcasecmp($a['label'], $b['label']);
        return $sortOrder === 'desc' ? -$result : $result;
    });
}

sendVarToJS('chartData', $chartData);
sendVarToJS('chartType', $chartType);
sendVarToJS('aggregationMode', $aggregationMode);
sendVarToJS('nbDays', $nbDays);

// Tarifs énergétiques pour les calculs côté client
$rateHP = config::byKey('energyRateHP', 'iotawatt', 0.1808);
$rateHC = config::byKey('energyRateHC', 'iotawatt', 0.1256);
$avgRate = $rateHC > 0 ? ($rateHC * 0.33 + $rateHP * 0.67) : $rateHP;

sendVarToJS('energyRateHP', $rateHP);
sendVarToJS('energyRateHC', $rateHC);
sendVarToJS('energyRateAvg', $avgRate);

// Calcul des données HC/HP détaillées
$equipmentDailyHCHP = [];
$dailyTotals = [];
$currentTariffType = config::byKey('tariffType', 'iotawatt', 'base');

if ($aggregationMode === 'daily') {
    $hcHours = config::byKey('hcHours', 'iotawatt', '22h00-6h00');

    // Précalculer le mapping nom -> cmdId pour optimiser
    $labelToCmdId = [];
    foreach ($cmdArray as $key => $equipment) {
        if (empty($equipment['consoId'])) continue;
        
        $equipName = $equipment['consoName'] ?? $equipment['eqName'] ?? __('Entrée', __FILE__) . ' ' . $key;
        $equipName = strip_tags($equipName);
        $equipName = str_replace(['Consommation', 'Puissance'], '', $equipName);
        $equipName = trim($equipName);
        
        $labelToCmdId[$equipName] = $equipment['consoId'];
    }

    foreach ($chartData['datasets'] as $dataset) {
        $dailyHCHP = [];
        $cmdId = $labelToCmdId[$dataset['label']] ?? null;

        if ($cmdId) {
            // Calculer les consommations HC/HP réelles depuis l'historique pour chaque jour
            for ($i = $nbDays - 1; $i >= 0; $i--) {
                $date = date('Y-m-d', strtotime("-$i days"));
                $consumptionKwh = $dataset['data'][$nbDays - 1 - $i]; // Déjà en kWh

                if ($consumptionKwh > 0) {
                    // Récupérer la couleur Tempo pour ce jour
                    $dayColor = ($currentTariffType === 'tempo') ? getTempoDayColor($date) : null;
                    
                    // Calculer la répartition HC/HP RÉELLE depuis l'historique
                if ($currentTariffType === 'tempo' && $dayColor) {
                    // Pour Tempo, utiliser la fonction qui gère les transitions de couleur
                    $hchpDetails = calculatePreciseHCHPTempoConsumption($cmdId, $date, $dayColor);
                } else {
                    // Pour HC/HP classique
                    $hchpDetails = calculateRealHCHPFromHistory($cmdId, $date, $currentTariffType);
                }
                
                $dailyHCHP[] = [
                    'date' => $date,
                    'hc' => $hchpDetails['hc'],
                    'hp' => $hchpDetails['hp'],
                    'day_color' => $dayColor,
                    'total' => $hchpDetails['total'],
                    'periods' => $hchpDetails['details'] ?? []  // Détails des périodes
                ];
            } else {
                $dailyHCHP[] = [
                    'date' => $date,
                    'hc' => 0,
                    'hp' => 0,
                    'day_color' => null,
                    'total' => 0,
                    'periods' => []
                ];
            }
        }
    } else {
        // Fallback si pas de cmdId
        for ($i = $nbDays - 1; $i >= 0; $i--) {
            $date = date('Y-m-d', strtotime("-$i days"));
            $consumptionKwh = $dataset['data'][$nbDays - 1 - $i];
            $dayColor = ($currentTariffType === 'tempo') ? getTempoDayColor($date) : null;
            
            $dailyHCHP[] = [
                'date' => $date,
                'hc' => 0,
                'hp' => round($consumptionKwh, 3),
                'day_color' => $dayColor,
                'total' => round($consumptionKwh, 3)
            ];
        }
    }

        $equipmentDailyHCHP[$dataset['label']] = $dailyHCHP;
    }

    // Calculer les totaux HC/HP par jour pour les tooltips
    for ($i = $nbDays - 1; $i >= 0; $i--) {
        $date = date('Y-m-d', strtotime("-$i days"));
        $dateLabel = date('d/m', strtotime($date));
        $dayColor = ($currentTariffType === 'tempo') ? getTempoDayColor($date) : null;
        
        $totalHC = 0;
        $totalHP = 0;
        $totalKwh = 0;
    
    // Agréger les périodes de toutes les entrées pour ce jour
    $mergedPeriods = [];
    
    foreach ($equipmentDailyHCHP as $equipName => $days) {
        $dayIndex = $nbDays - 1 - $i;
        if (isset($days[$dayIndex])) {
            $totalHC += $days[$dayIndex]['hc'];
            $totalHP += $days[$dayIndex]['hp'];
            $totalKwh += $days[$dayIndex]['total'];
            
            // Fusionner les périodes
            if (isset($days[$dayIndex]['periods']) && is_array($days[$dayIndex]['periods'])) {
                foreach ($days[$dayIndex]['periods'] as $period) {
                    if (isset($period['color'])) {
                        $color = $period['color'];
                        if (!isset($mergedPeriods[$color])) {
                            $mergedPeriods[$color] = ['color' => $color, 'hc' => 0, 'hp' => 0];
                        }
                        $mergedPeriods[$color]['hc'] += $period['hc'] ?? 0;
                        $mergedPeriods[$color]['hp'] += $period['hp'] ?? 0;
                    }
                }
            }
        }
    }
    
    // Calculer le coût du jour avec détails
    // Les tarifs EDF sont déjà TTC (incluent accise + TVA)
    // On calcule seulement : énergie TTC + abonnement TTC
    
    $subscriptionMonthly = getSubscriptionCost($currentTariffType, config::byKey('subscribedPower', 'iotawatt', 9));
    $subscriptionDaily = $subscriptionMonthly / 30;  // Abonnement quotidien HT
    
    $taxCTARate = config::byKey('taxCTA', 'iotawatt', 21.93) / 100;
    $ctaDaily = $subscriptionDaily * $taxCTARate;  // CTA quotidienne
    
    $fixedCostsHT = $subscriptionDaily + $ctaDaily;
    $fixedCostsTVA = $fixedCostsHT * (config::byKey('taxTVA', 'iotawatt', 20) / 100);
    $fixedCostsTTC = $fixedCostsHT + $fixedCostsTVA;
    
    $subscriptionCost = $subscriptionDaily;  // Pour compatibilité
    
    // Calculer les coûts HC/HP (tarifs EDF déjà TTC, donc juste multiplier)
    // IMPORTANT: Pour Tempo avec transition, calculer par période
    
    $costHC_TTC = 0;
    $costHP_TTC = 0;
    
    // Pour le tableau récapitulatif Tempo
    $tempoPeriodDetails = [];
    
    if ($currentTariffType === 'tempo' && !empty($mergedPeriods)) {
        // Calculer le coût par période (chaque couleur a son propre tarif)
        foreach ($mergedPeriods as $color => $consumption) {
            // Récupérer les tarifs TTC pour cette couleur
            $colorPrices = getEnergyPrices('tempo', $date, $color);
            
            // HC et HP pour cette couleur (tarifs déjà TTC)
            $periodCostHC = $consumption['hc'] * $colorPrices['hc'];
            $periodCostHP = $consumption['hp'] * $colorPrices['hp'];
            
            $costHC_TTC += $periodCostHC;
            $costHP_TTC += $periodCostHP;
            
            // Stocker les détails de la période pour le tableau récapitulatif
            $tempoPeriodDetails[] = [
                'color' => $color,
                'hc' => round($consumption['hc'], 3),
                'hp' => round($consumption['hp'], 3),
                'cost_hc' => round($periodCostHC, 2),
                'cost_hp' => round($periodCostHP, 2)
            ];
        }
    } else if ($currentTariffType === 'hphc') {
        // HPHC classique: un seul tarif (déjà TTC)
        $prices = getEnergyPrices('hphc', $date, null);
        
        $costHC_TTC = $totalHC * $prices['hc'];
        $costHP_TTC = $totalHP * $prices['hp'];
    } else {
        // En tarif base, tout est considéré comme HP (tarif déjà TTC)
        $prices = getEnergyPrices($currentTariffType, $date, null);
        $costHP_TTC = $totalKwh * ($prices['base'] ?? 0);
    }
    
    // Calculer le coût total du jour : énergie TTC + frais fixes TTC
    $dayCost = $costHC_TTC + $costHP_TTC + $fixedCostsTTC;
    
        $dailyTotals[$dateLabel] = [
            'date' => $date,
            'hc' => round($totalHC, 3),
            'hp' => round($totalHP, 3),
            'total' => round($totalKwh, 3),
            'cost_hc_ttc' => round($costHC_TTC, 2),
            'cost_hp_ttc' => round($costHP_TTC, 2),
            'cost_total' => round($dayCost, 2),
            'cost_subscription' => round($subscriptionCost, 2),
            'tempo_color' => $dayColor,
            'day_color' => $dayColor,
            'tempo_periods' => $tempoPeriodDetails,  // Détails par couleur Tempo
            'hc_percent' => $totalKwh > 0 ? round(($totalHC / $totalKwh) * 100, 1) : 0,
            'hp_percent' => $totalKwh > 0 ? round(($totalHP / $totalKwh) * 100, 1) : 0,
            'periods' => $mergedPeriods  // Inclure les périodes pour le JS
        ];
    }
} else {
    // Mode monthly/yearly : calculer les totaux agrégés HC/HP pour chaque période
    $hcHours = config::byKey('hcHours', 'iotawatt', '22h00-6h00');
    
    // Précalculer le mapping nom -> cmdId pour optimiser
    $labelToCmdId = [];
    foreach ($cmdArray as $key => $equipment) {
        if (empty($equipment['consoId'])) continue;
        
        $equipName = $equipment['consoName'] ?? $equipment['eqName'] ?? __('Entrée', __FILE__) . ' ' . $key;
        $equipName = strip_tags($equipName);
        $equipName = str_replace(['Consommation', 'Puissance'], '', $equipName);
        $equipName = trim($equipName);
        
        $labelToCmdId[$equipName] = $equipment['consoId'];
    }
    
    // Pour chaque période (mois ou année), agréger les HC/HP de tous les jours
    foreach ($chartData['labels'] as $periodIndex => $periodLabel) {
        $periodTotalHC = 0;
        $periodTotalHP = 0;
        $periodTotal = 0;
        $periodsByColor = []; // Pour Tempo: agréger par couleur
        
        // Parcourir tous les jours de la période pour agréger les HC/HP
        for ($i = $nbDays - 1; $i >= 0; $i--) {
            $date = date('Y-m-d', strtotime("-$i days"));
            
            // Vérifier si ce jour appartient à la période actuelle
            $belongsToPeriod = false;
            if ($aggregationMode === 'monthly') {
                $dayMonth = date('m/Y', strtotime($date));
                if ($dayMonth === $periodLabel) {
                    $belongsToPeriod = true;
                }
            } else if ($aggregationMode === 'yearly') {
                $dayYear = date('Y', strtotime($date));
                if ($dayYear === $periodLabel) {
                    $belongsToPeriod = true;
                }
            }
            
            if (!$belongsToPeriod) continue;
            
            // Agréger les HC/HP de tous les équipements pour ce jour
            foreach ($chartData['datasets'] as $dataset) {
                $cmdId = $labelToCmdId[$dataset['label']] ?? null;
                if (!$cmdId) continue;
                
                // Récupérer la couleur Tempo pour ce jour
                $dayColor = ($currentTariffType === 'tempo') ? getTempoDayColor($date) : null;
                
                // Calculer la répartition HC/HP RÉELLE depuis l'historique
                if ($currentTariffType === 'tempo' && $dayColor) {
                    $hchpDetails = calculatePreciseHCHPTempoConsumption($cmdId, $date, $dayColor);
                } else {
                    $hchpDetails = calculateRealHCHPFromHistory($cmdId, $date, $currentTariffType);
                }
                
                $periodTotalHC += $hchpDetails['hc'];
                $periodTotalHP += $hchpDetails['hp'];
                $periodTotal += $hchpDetails['total'];
                
                // Pour Tempo, agréger par couleur
                if ($currentTariffType === 'tempo' && $dayColor) {
                    if (!isset($periodsByColor[$dayColor])) {
                        $periodsByColor[$dayColor] = ['color' => $dayColor, 'hc' => 0, 'hp' => 0];
                    }
                    $periodsByColor[$dayColor]['hc'] += $hchpDetails['hc'];
                    $periodsByColor[$dayColor]['hp'] += $hchpDetails['hp'];
                }
            }
        }
        
        // Calculer les coûts
        $subscriptionMonthly = getSubscriptionCost($currentTariffType, config::byKey('subscribedPower', 'iotawatt', 9));
        $subscriptionPeriod = 0;
        
        if ($aggregationMode === 'monthly') {
            $subscriptionPeriod = $subscriptionMonthly;
        } else if ($aggregationMode === 'yearly') {
            $subscriptionPeriod = $subscriptionMonthly * 12;
        }
        
        // Calculer les coûts HC/HP
        $prices = getEnergyPrices($currentTariffType, date('Y-m-d'));
        
        $costHC_TTC = 0;
        $costHP_TTC = 0;
        
        if ($currentTariffType === 'tempo') {
            // Calculer le coût pour chaque couleur Tempo
            foreach ($periodsByColor as $color => $data) {
                $colorPrices = getEnergyPrices('tempo', date('Y-m-d'), $color);
                $hcCost = $data['hc'] * ($colorPrices['hc'] ?? 0);
                $hpCost = $data['hp'] * ($colorPrices['hp'] ?? 0);
                $hcTaxes = $data['hc'] * 0.02998;
                $hpTaxes = $data['hp'] * 0.02998;
                $hcCostTTC = ($hcCost + $hcTaxes) * 1.20;
                $hpCostTTC = ($hpCost + $hpTaxes) * 1.20;
                $costHC_TTC += $hcCostTTC;
                $costHP_TTC += $hpCostTTC;
                
                // Ajouter les coûts au tableau periodsByColor
                $periodsByColor[$color]['cost_hc'] = round($hcCostTTC, 2);
                $periodsByColor[$color]['cost_hp'] = round($hpCostTTC, 2);
            }
        } else if ($currentTariffType === 'hphc') {
            $hcCost = $periodTotalHC * ($prices['hc'] ?? 0);
            $hpCost = $periodTotalHP * ($prices['hp'] ?? 0);
            $hcTaxes = $periodTotalHC * 0.02998;
            $hpTaxes = $periodTotalHP * 0.02998;
            $costHC_TTC = ($hcCost + $hcTaxes) * 1.20;
            $costHP_TTC = ($hpCost + $hpTaxes) * 1.20;
        } else {
            // Base : tout en HP
            $hpCost = $periodTotal * ($prices['base'] ?? 0);
            $hpTaxes = $periodTotal * 0.02998;
            $costHP_TTC = ($hpCost + $hpTaxes) * 1.20;
        }
        
        // Calculer l'abonnement avec taxes
        $taxCTARate = config::byKey('taxCTA', 'iotawatt', 21.93) / 100;
        $ctaPeriod = $subscriptionPeriod * $taxCTARate;
        $fixedCostsHT = $subscriptionPeriod + $ctaPeriod;
        $fixedCostsTVA = $fixedCostsHT * (config::byKey('taxTVA', 'iotawatt', 20) / 100);
        $fixedCostsTTC = $fixedCostsHT + $fixedCostsTVA;
        
        $periodCost = $costHC_TTC + $costHP_TTC + $fixedCostsTTC;
        
        $dailyTotals[$periodLabel] = [
            'date' => $periodLabel,
            'hc' => round($periodTotalHC, 3),
            'hp' => round($periodTotalHP, 3),
            'total' => round($periodTotal, 3),
            'cost_hc_ttc' => round($costHC_TTC, 2),
            'cost_hp_ttc' => round($costHP_TTC, 2),
            'cost_total' => round($periodCost, 2),
            'cost_subscription' => round($subscriptionPeriod, 2),
            'tempo_color' => null,
            'day_color' => null,
            'tempo_periods' => [],
            'hc_percent' => $periodTotal > 0 ? round(($periodTotalHC / $periodTotal) * 100, 1) : 0,
            'hp_percent' => $periodTotal > 0 ? round(($periodTotalHP / $periodTotal) * 100, 1) : 0,
            'periods' => $periodsByColor  // Détails par couleur Tempo
        ];
    }
}

sendVarToJS('equipmentDailyHCHP', $equipmentDailyHCHP);
sendVarToJS('dailyTotals', $dailyTotals);

// Envoyer les tarifs et paramètres pour calcul côté JS
$subscribedPower = config::byKey('subscribedPower', 'iotawatt', 6);
$taxCTA = config::byKey('taxCTA', 'iotawatt', 0.0011);
$taxCSPE = config::byKey('taxCSPE', 'iotawatt', 0.0225);
$taxTVA = config::byKey('taxTVA', 'iotawatt', 20) / 100;

sendVarToJS('tariffType', $currentTariffType);
sendVarToJS('subscribedPower', $subscribedPower);
sendVarToJS('taxCTA', $taxCTA);
sendVarToJS('taxCSPE', $taxCSPE);
sendVarToJS('taxTVA', $taxTVA);
sendVarToJS('subscriptionDailyCost', getSubscriptionCost($currentTariffType, $subscribedPower) / 30);

// Envoyer les tarifs Tempo détaillés
if ($currentTariffType === 'tempo') {
    $tempoTariffs = [];
    foreach (['bleu', 'blanc', 'rouge'] as $color) {
        $prices = getEnergyPrices('tempo', date('Y-m-d'), $color);
        $tempoTariffs[$color] = [
            'hc' => $prices['hc'],
            'hp' => $prices['hp']
        ];
    }
    sendVarToJS('tempoTariffs', $tempoTariffs);
} else if ($currentTariffType === 'hphc') {
    $prices = getEnergyPrices('hphc', date('Y-m-d'));
    sendVarToJS('hphcTariffs', ['hc' => $prices['hc'], 'hp' => $prices['hp']]);
} else {
    $prices = getEnergyPrices('base', date('Y-m-d'));
    sendVarToJS('baseTariff', $prices['base']);
}

// Si autre chose, on garde l'ordre actuel

?>

<?php include_file('desktop', 'chart', 'css', 'iotawatt'); ?>

<div class="chart-controls">
    <div class="form-group">
        <label for="chartDateStart">{{Période}} :</label>
        <input class="form-control input-sm in_datepicker flatpickr-input" id="chartDateStart" type="text" style="width: 120px; display: inline-block;" placeholder="{{Date début}}" value="<?php echo date('d/m/Y', strtotime('-' . ($nbDays - 1) . ' days')); ?>">
        <span style="margin: 0 5px;">{{au}}</span>
        <input class="form-control input-sm in_datepicker flatpickr-input" id="chartDateEnd" type="text" style="width: 120px; display: inline-block;" placeholder="{{Date fin}}" value="<?php echo date('d/m/Y'); ?>">
        <?php if ($aggregationMode !== 'daily'): ?>
        <span style="margin-left: 10px; padding: 3px 8px; background: #94CA02; color: white; border-radius: 3px; font-size: 11px;">
            <?php 
                if ($aggregationMode === 'monthly') {
                    echo '📊 {{Agrégation mensuelle}}';
                } else if ($aggregationMode === 'yearly') {
                    echo '📊 {{Agrégation annuelle}}';
                }
            ?>
        </span>
        <?php endif; ?>
    </div>
    
    <div class="form-group">
        <label for="chartTypeSelect">{{Type}} :</label>
        <select id="chartTypeSelect" class="form-control input-sm" style="width: auto;">
            <option value="stacked" <?php echo $chartType == 'stacked' ? 'selected' : ''; ?>>{{Barres empilées}}</option>
            <option value="stacked-total" <?php echo $chartType == 'stacked-total' ? 'selected' : ''; ?>>{{Barres empilées total}}</option>
            <option value="pie" <?php echo $chartType == 'pie' ? 'selected' : ''; ?>>{{Camembert total}}</option>
            <option value="pie-daily" <?php echo $chartType == 'pie-daily' ? 'selected' : ''; ?>>{{Camembert journalier}}</option>
            <option value="grouped" <?php echo $chartType == 'grouped' ? 'selected' : ''; ?>>{{Barres groupées}}</option>
            <option value="grouped-total" <?php echo $chartType == 'grouped-total' ? 'selected' : ''; ?>>{{Barres groupées total}}</option>
            <option value="line" <?php echo $chartType == 'line' ? 'selected' : ''; ?>>{{Lignes}}</option>
            <option value="area" <?php echo $chartType == 'area' ? 'selected' : ''; ?>>{{Aires empilées}}</option>
            <option value="heatmap" <?php echo $chartType == 'heatmap' ? 'selected' : ''; ?>>{{Carte thermique}}</option>
        </select>
    </div>
    
    <div class="form-group">
        <label for="sortSelect">{{Trier par}} :</label>
        <select id="sortSelect" class="form-control input-sm" style="width: auto;">
            <option value="cmd-asc" <?php echo $sortType == 'cmd-asc' ? 'selected' : ''; ?>>{{Nom commande (A-Z)}}</option>
            <option value="cmd-desc" <?php echo $sortType == 'cmd-desc' ? 'selected' : ''; ?>>{{Nom commande (Z-A)}}</option>
            <option value="consumption-desc" <?php echo $sortType == 'consumption-desc' ? 'selected' : ''; ?>>{{Consommation (descendant)}}</option>
            <option value="consumption-asc" <?php echo $sortType == 'consumption-asc' ? 'selected' : ''; ?>>{{Consommation (ascendant)}}</option>
            <option value="equipment-asc" <?php echo $sortType == 'equipment-asc' ? 'selected' : ''; ?>>{{Nom de l'entrée (A-Z)}}</option>
            <option value="equipment-desc" <?php echo $sortType == 'equipment-desc' ? 'selected' : ''; ?>>{{Nom de l'entrée (Z-A)}}</option>
            <option value="peak-desc" <?php echo $sortType == 'peak-desc' ? 'selected' : ''; ?>>{{Pic de consommation (descendant)}}</option>
            <option value="peak-asc" <?php echo $sortType == 'peak-asc' ? 'selected' : ''; ?>>{{Pic de consommation (ascendant)}}</option>
            <option value="efficiency-desc" <?php echo $sortType == 'efficiency-desc' ? 'selected' : ''; ?>>{{Efficacité (descendant)}}</option>
            <option value="efficiency-asc" <?php echo $sortType == 'efficiency-asc' ? 'selected' : ''; ?>>{{Efficacité (ascendant)}}</option>
            <option value="cost-desc" <?php echo $sortType == 'cost-desc' ? 'selected' : ''; ?>>{{Coût estimé (descendant)}}</option>
            <option value="cost-asc" <?php echo $sortType == 'cost-asc' ? 'selected' : ''; ?>>{{Coût estimé (ascendant)}}</option>
            <option value="usage-pattern" <?php echo $sortType == 'usage-pattern' ? 'selected' : ''; ?>>{{Modèle d'usage}}</option>
        </select>
    </div>
    
    <div class="form-group">
        <button class="btn btn-sm btn-success" id="refreshChart">
            <i class="fas fa-sync-alt"></i> {{Actualiser}}
        </button>
    </div>
</div>

<div class="alert alert-info" style="margin-top: 10px; font-size: 12px;">
    <i class="fas fa-info-circle"></i> <strong>{{Note sur les coûts}} :</strong> {{Les calculs de coût estimé utilisent un tarif énergétique moyen pondéré basé sur vos paramètres de configuration.}}</br>{{Il s'agit d'une estimation simplifiée qui ne prend pas en compte les variations horaires réelles (Tempo, heures creuses/pleines).}}
</div>

<?php if (empty($chartData['datasets'])): ?>
    <div class="no-data">
        <i class="fas fa-chart-bar"></i>
        <p>{{Aucune donnée de consommation disponible}}</p>
        <small>{{Assurez-vous que vos entrées IoTaWatt enregistrent bien l'historique des consommations}}</small>
    </div>
<?php else: ?>
    

    <div class="chart-stats">
        <?php
        // Calculer les statistiques globales
        $totalConsumption = 0;
        $totalCostSum = 0;
        $avgConsumption = 0;
        $maxDay = ['value' => 0, 'date' => '', 'realDate' => '', 'cost' => 0];
        $minDay = ['value' => PHP_FLOAT_MAX, 'date' => '', 'realDate' => '', 'cost' => 0];
        
        foreach ($chartData['labels'] as $index => $label) {
            $dayTotal = 0;
            foreach ($chartData['datasets'] as $dataset) {
                $dayTotal += $dataset['data'][$index];
            }
            
            $totalConsumption += $dayTotal;
            
            // Récupérer le coût réel depuis dailyTotals
            $dayCost = isset($dailyTotals[$label]['cost_total']) ? $dailyTotals[$label]['cost_total'] : 0;
            $totalCostSum += $dayCost;
            
            if ($dayTotal > $maxDay['value']) {
                $realDate = date('Y-m-d', strtotime('-' . ($nbDays - 1 - $index) . ' days'));
                $maxDay = ['value' => $dayTotal, 'date' => $label, 'realDate' => $realDate, 'cost' => $dayCost];
            }
            if ($dayTotal < $minDay['value'] && $dayTotal > 0) {
                $realDate = date('Y-m-d', strtotime('-' . ($nbDays - 1 - $index) . ' days'));
                $minDay = ['value' => $dayTotal, 'date' => $label, 'realDate' => $realDate, 'cost' => $dayCost];
            }
        }
        
        $avgConsumption = count($chartData['labels']) > 0 ? $totalConsumption / count($chartData['labels']) : 0;
        
        // Utiliser les coûts réels calculés avec les HC/HP réels
        $totalCost = $totalCostSum;
        $maxDayCost = $maxDay['cost'];
        $minDayCost = $minDay['cost'];
        $avgDailyCost = $totalCost / $nbDays;
        
        $totalFormatted = round($totalConsumption, 2) . ' kWh';
        $avgFormatted = round($avgConsumption, 2) . ' kWh';
        $maxFormatted = round($maxDay['value'], 2) . ' kWh';
        $minFormatted = round($minDay['value'], 2) . ' kWh';
        ?>
        
        <div class="stat-card">
            <h4>{{Total sur la période}}</h4>
            <p class="value"><?php echo $totalFormatted; ?></p>
            <small style="color: #90ee90; font-weight: bold; font-size: 1.1em;"><?php echo number_format($totalCost, 2); ?> €</small>
        </div>
        
        <div class="stat-card info">
            <h4>{{Jour min}} (<?php echo $minDay['date']; ?>)</h4>
            <p class="value"><?php echo $minFormatted; ?></p>
            <small style="color: #87ceeb; font-weight: bold; font-size: 1.1em;"><?php echo number_format($minDayCost, 2); ?> €</small>
        </div>

        <div class="stat-card success">
            <h4>{{Moyenne quotidienne}}</h4>
            <p class="value"><?php echo $avgFormatted; ?></p>
            <small style="color: #90ee90; font-weight: bold; font-size: 1.1em;"><?php echo number_format($avgDailyCost, 2); ?> €</small>
        </div>
        
        <div class="stat-card warning">
            <h4>{{Jour max}} (<?php echo $maxDay['date']; ?>)</h4>
            <p class="value"><?php echo $maxFormatted; ?></p>
            <small style="color: #ffd700; font-weight: bold; font-size: 1.1em;"><?php echo number_format($maxDayCost, 2); ?> €</small>
        </div>
    </div>

    <!-- Statistiques tarifaires EDF -->
    <div class="chart-stats">
        <?php
        $tariffType = config::byKey('tariffType', 'iotawatt', 'base');
        $subscribedPower = config::byKey('subscribedPower', 'iotawatt', 6);
        $tariffInfo = getEnergyPrices($tariffType);
        $subscription = getSubscriptionCost($tariffType, $subscribedPower);
        ?>

        <div class="stat-card success">
            <h4>{{Abonnement mensuel}}</h4>
            <p class="value"><?php echo number_format($subscription, 2); ?> €</p>
            <small>{{<?php echo $subscribedPower; ?> kVA}}</small>
        </div>

        <?php if ($tariffType === 'tempo'): ?>
            <!-- Tableau récapitulatif Tempo pour la période -->
            <?php
            // Calculer les totaux par couleur et période HC/HP
            $tempoSummary = [
                'bleu' => ['hc' => 0, 'hp' => 0, 'cost_hc' => 0, 'cost_hp' => 0, 'days' => 0],
                'blanc' => ['hc' => 0, 'hp' => 0, 'cost_hc' => 0, 'cost_hp' => 0, 'days' => 0],
                'rouge' => ['hc' => 0, 'hp' => 0, 'cost_hc' => 0, 'cost_hp' => 0, 'days' => 0]
            ];
            
            // Agréger les données depuis dailyTotals
            foreach ($dailyTotals as $dateLabel => $dayData) {
                if (isset($dayData['tempo_periods']) && !empty($dayData['tempo_periods'])) {
                    foreach ($dayData['tempo_periods'] as $period) {
                        $color = $period['color'];
                        if (isset($tempoSummary[$color])) {
                            $tempoSummary[$color]['hc'] += $period['hc'];
                            $tempoSummary[$color]['hp'] += $period['hp'];
                            $tempoSummary[$color]['cost_hc'] += $period['cost_hc'];
                            $tempoSummary[$color]['cost_hp'] += $period['cost_hp'];
                        }
                    }
                    // Compter le jour selon sa couleur principale (6h-24h)
                    $mainColor = $dayData['tempo_color'] ?? 'bleu';
                    if (isset($tempoSummary[$mainColor])) {
                        $tempoSummary[$mainColor]['days']++;
                    }
                }
            }
            
            // Récupérer les tarifs TTC
            $tariffBleu = getEnergyPrices('tempo', date('Y-m-d'), 'bleu');
            $tariffBlanc = getEnergyPrices('tempo', date('Y-m-d'), 'blanc');
            $tariffRouge = getEnergyPrices('tempo', date('Y-m-d'), 'rouge');
            ?>
            <div class="stat-card tempo-summary">
                <h4>{{Consommation Tempo}} (<?php echo $nbDays; ?> jours)</h4>
                <table class="tempo-table table-bordered table-condensed tableCmd">
                    <thead>
                        <tr>
                            <th></th>
                            <th class="text-center tempo-col-bleu">🔵 Bleu (<?php echo $tempoSummary['bleu']['days']; ?>j)</th>
                            <th class="text-center tempo-col-blanc">⚪ Blanc (<?php echo $tempoSummary['blanc']['days']; ?>j)</th>
                            <th class="text-center tempo-col-rouge">🔴 Rouge (<?php echo $tempoSummary['rouge']['days']; ?>j)</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><strong>{{Heures Creuses}}</strong></td>
                            <td class="text-center">
                                <?php echo number_format($tempoSummary['bleu']['hc'], 2); ?> kWh<br>
                                <small class="text-muted"><?php echo number_format($tempoSummary['bleu']['cost_hc'], 2); ?> € 
                                <span class="tempo-tariff">(<?php echo number_format($tariffBleu['hc'], 4); ?> €/kWh)</span></small>
                            </td>
                            <td class="text-center">
                                <?php echo number_format($tempoSummary['blanc']['hc'], 2); ?> kWh<br>
                                <small class="text-muted"><?php echo number_format($tempoSummary['blanc']['cost_hc'], 2); ?> € 
                                <span class="tempo-tariff">(<?php echo number_format($tariffBlanc['hc'], 4); ?> €/kWh)</span></small>
                            </td>
                            <td class="text-center">
                                <?php echo number_format($tempoSummary['rouge']['hc'], 2); ?> kWh<br>
                                <small class="text-muted"><?php echo number_format($tempoSummary['rouge']['cost_hc'], 2); ?> € 
                                <span class="tempo-tariff">(<?php echo number_format($tariffRouge['hc'], 4); ?> €/kWh)</span></small>
                            </td>
                        </tr>
                        <tr>
                            <td><strong>{{Heures Pleines}}</strong></td>
                            <td class="text-center">
                                <?php echo number_format($tempoSummary['bleu']['hp'], 2); ?> kWh<br>
                                <small class="text-muted"><?php echo number_format($tempoSummary['bleu']['cost_hp'], 2); ?> € 
                                <span class="tempo-tariff">(<?php echo number_format($tariffBleu['hp'], 4); ?> €/kWh)</span></small>
                            </td>
                            <td class="text-center">
                                <?php echo number_format($tempoSummary['blanc']['hp'], 2); ?> kWh<br>
                                <small class="text-muted"><?php echo number_format($tempoSummary['blanc']['cost_hp'], 2); ?> € 
                                <span class="tempo-tariff">(<?php echo number_format($tariffBlanc['hp'], 4); ?> €/kWh)</span></small>
                            </td>
                            <td class="text-center">
                                <?php echo number_format($tempoSummary['rouge']['hp'], 2); ?> kWh<br>
                                <small class="text-muted"><?php echo number_format($tempoSummary['rouge']['cost_hp'], 2); ?> € 
                                <span class="tempo-tariff">(<?php echo number_format($tariffRouge['hp'], 4); ?> €/kWh)</span></small>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        <?php else: ?>
            <!-- Tuile classique pour Base et HP/HC -->
            <div class="stat-card warning">
                <h4>
                    <?php
                    switch ($tariffType) {
                        case 'base': echo 'Tarif Base'; break;
                        case 'hphc': echo 'HP/HC'; break;
                        default: echo 'Tarif';
                    }
                    ?>
                </h4>
                <p class="value">
                    <?php
                    if ($tariffType === 'base') {
                        echo number_format($tariffInfo['base'], 4) . ' €/kWh';
                    } elseif ($tariffType === 'hphc') {
                        echo 'HP: ' . number_format($tariffInfo['hp'], 4) . ' €/kWh<br>HC: ' . number_format($tariffInfo['hc'], 4) . ' €/kWh';
                    }
                    ?>
                </p>
                <small>
                    {{Applicable depuis le <?php echo date('d/m/Y', strtotime($tariffInfo['date'])); ?>}}
                </small>
            </div>
        <?php endif; ?>
    </div>

    <div class="chart-visual">
        <h4 id="chartTitle"><i class="fas fa-chart-bar"></i> {{Graphique empilé}} - {{Consommations quotidiennes}}</h4>

        <!-- Conteneur pour les graphiques (chargés dynamiquement) -->
        <div class="form-group">
            <div class="toggle-container" id="toggleValueType" style="display: none;">
                <span class="toggle-label">kWh</span>
                <label class="toggle-switch">
                    <input type="checkbox" checked>
                    <span class="toggle-slider"></span>
                </label>
                <span class="toggle-label">€</span>
            </div>
        </div>
        <div id="chartContainer" class="chart-container">
            <div class="chart-loading">
                <i class="fas fa-spinner fa-spin"></i> {{Chargement du graphique...}}
            </div>
        </div>

        <div class="chart-legend-inline">
            <small><i class="fas fa-info-circle"></i> {{Survolez les éléments pour voir les détails}}</small>
        </div>
    </div>

    <div class="chart-equipment-list">
        <h4><i class="fas fa-list"></i> {{Liste des entrées}}</h4>
        <?php foreach ($chartData['datasets'] as $index => $dataset): ?>
            <div class="equipment-card" data-cmd-id="<?php echo $chartData['cmdIds'][$index]; ?>">
                <div class="equipment-color" style="background-color: <?php echo $dataset['backgroundColor']; ?>"></div>
                <div class="equipment-info">
                    <span class="equipment-name"><?php echo htmlspecialchars($dataset['label']); ?></span>
                    <span class="equipment-total">
                        <?php 
                        $equipTotal = array_sum($dataset['data']);
                        $equipFormatted = round($equipTotal, 2) . ' kWh';
                        echo $equipFormatted;
                        ?>
                    </span>
                </div>
                <button class="btn btn-xs btn-primary view-history" data-title="{{Voir l'historique}}">
                    <i class="fas fa-chart-line"></i>
                </button>
            </div>
        <?php endforeach; ?>
    </div>

    </div>

<?php endif; ?>

<?php
// Log de fin avec statistiques de performance
$endTime = microtime(true);
$executionTime = round($endTime - $startTime, 2);
$cacheHits = count($GLOBALS['hchp_cache']) + count($GLOBALS['hchp_tempo_cache']);
$nbEquipements = count($chartData['datasets']);
log::add('iotawatt', 'info', "=== Fin génération graphique === Temps: {$executionTime}s | Équipements: {$nbEquipements} | Cache entries: {$cacheHits}");
?>

<?php include_file('desktop', 'chart', 'js', 'iotawatt'); ?>