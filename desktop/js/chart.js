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
 * Jeedom is received a copy of the GNU General Public License
 * along with Jeedom. If not, see <http://www.gnu.org/licenses/>.
 */

/* global flatpickr */

(function() {
    'use strict';
    
    // ========================================
    // CONSTANTES & CONFIGURATION
    // ========================================
    
    var chartData = window.chartData || {};
    var aggregationMode = window.aggregationMode || 'daily';
    var nbDays = window.nbDays || 7;
    
    // Configuration commune des graphiques journaliers (optimisée pour affichage multi-jours)
    var DAILY_CHART_CONFIG = {
        viewBoxWidth: 200,
        viewBoxHeight: 200,
        padding: 30,
        get chartWidth() { return this.viewBoxWidth - 2 * this.padding; },
        get chartHeight() { return this.viewBoxHeight - 2 * this.padding - 30; }
    };

    // Système de tooltip simple
    var createTooltip = function() {
        var tooltip = document.createElement('div');
        tooltip.className = 'chart-tooltip';
        tooltip.style.cssText = 'position: fixed; background: rgba(0,0,0,0.9); color: white; padding: 8px 12px; border-radius: 4px; font-size: 12px; pointer-events: none; z-index: 10000; display: none; box-shadow: 0 2px 8px rgba(0,0,0,0.3);';
        document.body.appendChild(tooltip);
        return tooltip;
    };

    var tooltip = createTooltip();
    
    // ========================================
    // FONCTIONS UTILITAIRES COMMUNES
    // ========================================
    
    /**
     * Fonction pour obtenir le label d'affichage selon le mode d'agrégation
     * @param {string} label - Label original (format: dd/mm, mm/yyyy ou yyyy)
     * @param {string} mode - Mode d'agrégation ('daily', 'monthly', 'yearly')
     * @returns {string} Label formaté
     */
    function getPeriodLabel(label, mode) {
        if (mode === 'monthly') {
            return label; // Déjà au format mm/yyyy
        } else if (mode === 'yearly') {
            return label; // Déjà au format yyyy
        } else {
            return label; // Format dd/mm
        }
    }
    
    /**
     * Fonction pour obtenir le label de période descriptif
     * @param {string} label - Label original
     * @param {string} mode - Mode d'agrégation
     * @returns {string} Description de la période
     */
    function getPeriodDescription(label, mode) {
        if (mode === 'monthly') {
            var parts = label.split('/');
            var months = ['{{Jan}}', '{{Fév}}', '{{Mar}}', '{{Avr}}', '{{Mai}}', '{{Juin}}', '{{Juil}}', '{{Août}}', '{{Sep}}', '{{Oct}}', '{{Nov}}', '{{Déc}}'];
            return months[parseInt(parts[0]) - 1] + ' ' + parts[1];
        } else if (mode === 'yearly') {
            return '{{Année}} ' + label;
        } else {
            return label;
        }
    }
    
    // Préparer les données équipement pour un jour donné (utilisé par ligne & aire)
    function prepareEquipmentData(chartData, dayIndex) {
        var dayTotal = 0;
        var dayTotalCost = 0;
        var equipments = [];
        var minValue = Infinity;
        var maxValue = 0;
        
        chartData.datasets.forEach(function(dataset) {
            var value = dataset.data[dayIndex] || 0;
            if (value > 0) {
                var equipmentCost = window.equipmentCosts && window.equipmentCosts[dataset.label];
                var totalEquipmentValue = dataset.data.reduce(function(sum, val) { return sum + (val || 0); }, 0);
                var cost = equipmentCost && totalEquipmentValue > 0 ? ((value / totalEquipmentValue) * equipmentCost.total) : 0;
                
                equipments.push({
                    label: dataset.label,
                    value: value,
                    cost: cost,
                    color: dataset.backgroundColor,
                    borderColor: dataset.borderColor
                });
                
                dayTotal += value;
                dayTotalCost += cost;
                minValue = Math.min(minValue, value);
                maxValue = Math.max(maxValue, value);
            }
        });
        
        return { equipments: equipments, dayTotal: dayTotal, dayTotalCost: dayTotalCost, minValue: minValue, maxValue: maxValue };
    }
    
    // Générer un wrapper de graphique journalier (réutilisable)
    function createDayChartWrapper(label, dayTotal, dayTotalCost, svgContent, config, dayData) {
        var dayTooltip = generateDetailedTooltip(label, dayTotal, dayTotalCost, dayData);
        var showCost = document.querySelector('.chart-controls select[name="display"]').value === 'cost';
        
        return '<div class="daily-pie-item">' +
                '<div class="daily-pie-kwh" data-tooltip="' + dayTooltip + '" style="' + (showCost ? 'display: none;' : '') + '">' + dayTotal.toFixed(2) + ' kWh</div>' +
                '<div class="daily-pie-cost" data-tooltip="' + dayTooltip + '" style="' + (showCost ? '' : 'display: none;') + '">' + dayTotalCost.toFixed(2) + ' €</div>' +
                '<svg viewBox="0 0 ' + config.viewBoxWidth + ' ' + config.viewBoxHeight + '" class="pie-chart">' + svgContent + '</svg>' +
                '<div class="daily-pie-date">' + label + '</div>' +
                '</div>';
    }

    // Fonction pour calculer le coût d'une consommation selon les tarifs
    function calculateCost(hcKwh, hpKwh, dayColor) {
        var tariffType = window.tariffType || 'base';
        var energyCostTTC = 0;
        
        // Convertir les paramètres en nombres (au cas où ce sont des chaînes)
        hcKwh = parseFloat(hcKwh) || 0;
        hpKwh = parseFloat(hpKwh) || 0;
        
        var hcCostTTC = 0;
        var hpCostTTC = 0;
        
        try {
            // Les tarifs EDF sont DÉJÀ TTC (incluent accise + TVA)
            // On multiplie simplement la consommation par le tarif TTC
            
            if (tariffType === 'tempo' && window.tempoTariffs) {
                var color = dayColor || 'bleu';
                var tariffs = window.tempoTariffs[color];
                if (tariffs && tariffs.hc && tariffs.hp) {
                    hcCostTTC = hcKwh * parseFloat(tariffs.hc);
                    hpCostTTC = hpKwh * parseFloat(tariffs.hp);
                    energyCostTTC = hcCostTTC + hpCostTTC;
                }
            } else if (tariffType === 'hphc' && window.hphcTariffs) {
                if (window.hphcTariffs.hc && window.hphcTariffs.hp) {
                    hcCostTTC = hcKwh * parseFloat(window.hphcTariffs.hc);
                    hpCostTTC = hpKwh * parseFloat(window.hphcTariffs.hp);
                    energyCostTTC = hcCostTTC + hpCostTTC;
                }
            } else if (window.baseTariff) {
                energyCostTTC = (hcKwh + hpKwh) * parseFloat(window.baseTariff);
                hpCostTTC = energyCostTTC; // En base, tout est considéré comme HP
            }
            
            return {
                energy: energyCostTTC,  // Déjà TTC
                taxes: 0,  // Pas de taxes supplémentaires (déjà incluses)
                subscription: 0,  // Géré au niveau jour
                total: energyCostTTC,
                hc_cost: hcCostTTC,
                hp_cost: hpCostTTC
            };
        } catch (e) {
            console.error('Erreur calcul coût:', e, 'hcKwh:', hcKwh, 'hpKwh:', hpKwh, 'dayColor:', dayColor);
            return {
                energy: 0,
                taxes: 0,
                subscription: 0,
                total: 0,
                hc_cost: 0,
                hp_cost: 0
            };
        }
    }

    // Générer un tooltip détaillé pour les totaux (format: Total + Énergie + Frais fixes + détails HC/HP)
    function generateDetailedTooltip(label, totalKwh, totalCost, dayData) {
        var tooltipLines = [];
        tooltipLines.push('<strong>' + label + '</strong>');
        tooltipLines.push('{{Total}} : ' + totalKwh.toFixed(2) + ' kWh (' + totalCost.toFixed(2) + ' €)');
        
        // Ajouter les détails énergie vs frais fixes si disponibles
        if (dayData) {
            var energyCostHCHP = parseFloat(dayData.cost_hc_ttc || 0) + parseFloat(dayData.cost_hp_ttc || 0);
            var fixedCosts = totalCost - energyCostHCHP;
            if (fixedCosts > 0.01) {
                //tooltipLines.push('   Énergie: ' + energyCostHCHP.toFixed(2) + ' €');
                tooltipLines.push('   {{dont abonnement}} : ' + fixedCosts.toFixed(2) + ' €');
            }
        }
        
        tooltipLines.push('========================');
        
        // Ajouter les détails HC/HP par couleur Tempo si disponibles
        if (dayData) {
            var tariffType = window.tariffType || 'base';
            var totalDayKwh = parseFloat(dayData.total) || totalKwh;
            
            // Pour une période agrégée avec plusieurs couleurs Tempo
            if (tariffType === 'tempo' && dayData.periods && Object.keys(dayData.periods).length > 0) {
                // Grouper par couleur (bleu, blanc, rouge)
                var colorGroups = {
                    'bleu': { hc: 0, hp: 0 },
                    'blanc': { hc: 0, hp: 0 },
                    'rouge': { hc: 0, hp: 0 }
                };
                
                Object.keys(dayData.periods).forEach(function(periodKey) {
                    var period = dayData.periods[periodKey];
                    var color = period.color;
                    if (colorGroups[color]) {
                        colorGroups[color].hc += parseFloat(period.hc) || 0;
                        colorGroups[color].hp += parseFloat(period.hp) || 0;
                    }
                });
                
                // Afficher par couleur
                var colors = ['bleu', 'blanc', 'rouge'];
                colors.forEach(function(color) {
                    var colorData = colorGroups[color];
                    var colorEmoji = color === 'bleu' ? '🔵' : (color === 'blanc' ? '⚪' : '🔴');
                    
                    if (colorData.hc > 0) {
                        var hcPercent = totalDayKwh > 0 ? ((colorData.hc / totalDayKwh) * 100).toFixed(1) : 0;
                        tooltipLines.push('HC ' + colorEmoji + ' ' + colorData.hc.toFixed(2) + ' kWh (' + hcPercent + '%)');
                    }
                    if (colorData.hp > 0) {
                        var hpPercent = totalDayKwh > 0 ? ((colorData.hp / totalDayKwh) * 100).toFixed(1) : 0;
                        tooltipLines.push('HP ' + colorEmoji + ' ' + colorData.hp.toFixed(2) + ' kWh (' + hpPercent + '%)');
                    }
                });
                
                // Ajouter les totaux HC/HP
                var totalHC = parseFloat(dayData.hc) || 0;
                var totalHP = parseFloat(dayData.hp) || 0;
                var totalHCCost = parseFloat(dayData.cost_hc_ttc) || 0;
                var totalHPCost = parseFloat(dayData.cost_hp_ttc) || 0;
                if (totalHC > 0) {
                    tooltipLines.push('{{Total HC}} : ' + totalHCCost.toFixed(2) + ' €');
                }
                if (totalHP > 0) {
                    tooltipLines.push('{{Total HP}} : ' + totalHPCost.toFixed(2) + ' €');
                }
            } else if (tariffType === 'tempo' || tariffType === 'hphc') {
                // Afficher simple HC/HP (jour unicolore ou HP/HC)
                var simpleTotalHC = parseFloat(dayData.hc) || 0;
                var simpleTotalHP = parseFloat(dayData.hp) || 0;
                var simpleTotalHCCost = parseFloat(dayData.cost_hc_ttc) || 0;
                var simpleTotalHPCost = parseFloat(dayData.cost_hp_ttc) || 0;
                var dayColor = dayData.day_color;
                
                if (tariffType === 'tempo' && dayColor) {
                    var colorEmoji = dayColor === 'bleu' ? '🔵' : (dayColor === 'blanc' ? '⚪' : '🔴');
                    if (simpleTotalHC > 0) {
                        var tempoHcPercent = totalDayKwh > 0 ? ((simpleTotalHC / totalDayKwh) * 100).toFixed(1) : 0;
                        tooltipLines.push('HC ' + colorEmoji + ' ' + simpleTotalHC.toFixed(2) + ' kWh (' + tempoHcPercent + '%)');
                    }
                    if (simpleTotalHP > 0) {
                        var tempoHpPercent = totalDayKwh > 0 ? ((simpleTotalHP / totalDayKwh) * 100).toFixed(1) : 0;
                        tooltipLines.push('HP ' + colorEmoji + ' ' + simpleTotalHP.toFixed(2) + ' kWh (' + tempoHpPercent + '%)');
                    }
                } else {
                    // HP/HC sans couleur
                    if (simpleTotalHC > 0) {
                        var standardHcPercent = totalDayKwh > 0 ? ((simpleTotalHC / totalDayKwh) * 100).toFixed(1) : 0;
                        tooltipLines.push('HC ' + simpleTotalHC.toFixed(2) + ' kWh (' + standardHcPercent + '%)');
                    }
                    if (simpleTotalHP > 0) {
                        var standardHpPercent = totalDayKwh > 0 ? ((simpleTotalHP / totalDayKwh) * 100).toFixed(1) : 0;
                        tooltipLines.push('HP ' + simpleTotalHP.toFixed(2) + ' kWh (' + standardHpPercent + '%)');
                    }
                }
                
                // Ajouter les totaux de coût HC/HP
                if (simpleTotalHC > 0) {
                    tooltipLines.push('{{Total HC}} : ' + simpleTotalHCCost.toFixed(2) + ' €');
                }
                if (simpleTotalHP > 0) {
                    tooltipLines.push('{{Total HP}} : ' + simpleTotalHPCost.toFixed(2) + ' €');
                }
            }
        }
        
        return tooltipLines.join('<br>');
    }
    
    // Calculer les coûts par équipement (pour tous les graphiques)
    function calculateEquipmentCosts() {
        if (!window.chartData || !window.chartData.datasets) return {};
        
        var equipmentCosts = {};
        var nbDays = window.chartData.labels.length;
        
        window.chartData.datasets.forEach(function(dataset) {
            var totalCost = 0;
            var equipmentLabel = dataset.label;
            
            // Calculer le coût pour chaque jour
            dataset.data.forEach(function(value, dayIndex) {
                if (value > 0) {
                    // Récupérer les données HC/HP pour cet équipement et ce jour
                    var equipmentHCHP = window.equipmentDailyHCHP && window.equipmentDailyHCHP[equipmentLabel];
                    if (equipmentHCHP && equipmentHCHP[dayIndex]) {
                        var hcKwh = equipmentHCHP[dayIndex].hc || 0;
                        var hpKwh = equipmentHCHP[dayIndex].hp || 0;
                        var dayColor = equipmentHCHP[dayIndex].day_color;
                        
                        var costData = calculateCost(hcKwh, hpKwh, dayColor);
                        totalCost += costData.total;
                    }
                }
            });
            
            equipmentCosts[equipmentLabel] = {
                total: totalCost,
                average: totalCost / nbDays
            };
        });
        
        return equipmentCosts;
    }

    // Fonction pour rendre un graphique spécifique
    function renderChart(chartType) {
        var container = document.getElementById('chartContainer');
        if (!container) return;

        // Sauvegarder le type de graphique actuel
        window.currentChartType = chartType;

        // Afficher le loading
        container.innerHTML = '<div class="chart-loading"><i class="fas fa-spinner fa-spin"></i> {{Chargement du graphique...}}</div>';
        
        // Calculer les coûts pour tous les équipements
        window.equipmentCosts = calculateEquipmentCosts();

        // Afficher/masquer le bouton de bascule selon le type de graphique
        var toggleBtn = document.getElementById('toggleValueType');
        if (toggleBtn) {
            var supportsToggle = ['stacked', 'stacked-total', 'pie', 'pie-daily', 'grouped', 'grouped-total', 'line', 'area'].indexOf(chartType) !== -1;
            toggleBtn.style.display = supportsToggle ? 'inline-flex' : 'none';
        }

        // Générer le graphique côté client
        var html = generateChartHTML(chartType);
        container.innerHTML = html;

        // Attacher les événements après génération
        attachChartEvents();
        
        // Appliquer l'état du toggle après génération
        if (toggleBtn) {
            applyToggleState(chartType);
        }
    }
    
    // Fonction pour appliquer l'état du toggle
    function applyToggleState(chartType) {
        // Gérer l'affichage des chart-bar-cost et chart-bar-value
        var toggleBtn = document.getElementById('toggleValueType');
        if (!toggleBtn) return;
        
        var checkbox = toggleBtn.querySelector('input[type="checkbox"]');
        var showCost = checkbox && checkbox.checked;
        
        // Afficher/masquer les labels de coût et valeur dans les barres empilées
        document.querySelectorAll('.chart-bar-cost').forEach(function(el) {
            el.style.display = showCost ? 'block' : 'none';
        });
        
        document.querySelectorAll('.chart-bar-value').forEach(function(el) {
            el.style.display = showCost ? 'none' : 'block';
        });
        
        // Afficher/masquer les labels dans les camemberts totaux
        document.querySelectorAll('.pie-center-kwh').forEach(function(el) {
            el.style.display = showCost ? 'none' : 'block';
        });
        
        document.querySelectorAll('.pie-center-cost').forEach(function(el) {
            el.style.display = showCost ? 'block' : 'none';
        });
        
        // Afficher/masquer les labels dans les camemberts journaliers
        document.querySelectorAll('.daily-pie-kwh').forEach(function(el) {
            el.style.display = showCost ? 'none' : 'block';
        });
        
        document.querySelectorAll('.daily-pie-cost').forEach(function(el) {
            el.style.display = showCost ? 'block' : 'none';
        });
        
        // Afficher/masquer les labels dans les barres groupées
        document.querySelectorAll('.grouped-kwh').forEach(function(el) {
            el.style.display = showCost ? 'none' : 'block';
        });
        
        document.querySelectorAll('.grouped-cost').forEach(function(el) {
            el.style.display = showCost ? 'block' : 'none';
        });
        
        // Afficher/masquer les labels dans les graphiques ligne/aire
        document.querySelectorAll('.chart-period-total-kwh').forEach(function(el) {
            el.style.display = showCost ? 'none' : 'block';
        });
        
        document.querySelectorAll('.chart-period-total-cost').forEach(function(el) {
            el.style.display = showCost ? 'block' : 'none';
        });
        
        document.querySelectorAll('.chart-period-total').forEach(function(el) {
            var tooltipText = el.getAttribute('data-tooltip');
            if (tooltipText) {
                // Le tooltip contient les deux valeurs, on garde l'affichage du label constant
                // mais on pourrait changer le texte visible si nécessaire
            }
        });
    }

    // Générer le HTML du graphique
    function generateChartHTML(chartType) {
        var chartData = window.chartData;
        if (!chartData || !chartData.datasets || chartData.datasets.length === 0) {
            return '<div class="no-data"><i class="fas fa-chart-bar"></i><p>{{Aucune donnée disponible}}</p></div>';
        }

        switch(chartType) {
            case 'stacked':
                return generateStackedChart(chartData);
            case 'stacked-total':
                return generateStackedTotalChart(chartData);
            case 'pie':
                return generatePieChart(chartData);
            case 'pie-daily':
                return generateDailyPieChart(chartData);
            case 'grouped':
                return generateGroupedChart(chartData);
            case 'grouped-total':
                return generateGroupedTotalChart(chartData);
            case 'line':
                return generateLineChart(chartData);
            case 'area':
                return generateAreaChart(chartData);
            case 'heatmap':
                return generateHeatmapChart(chartData);
            default:
                return generateStackedChart(chartData);
        }
    }

    // Générer graphique barres empilées
    function generateStackedChart(chartData) {
        // Déterminer si on affiche en € ou en kWh
        var toggleBtn = document.getElementById('toggleValueType');
        var checkbox = toggleBtn ? toggleBtn.querySelector('input[type="checkbox"]') : null;
        var showCost = checkbox && checkbox.checked;
        
        // Précalculer tous les coûts une seule fois pour optimiser
        var precalculatedCosts = {};
        if (showCost && aggregationMode === 'daily') {
            chartData.datasets.forEach(function(dataset) {
                precalculatedCosts[dataset.label] = [];
                for (var idx = 0; idx < chartData.labels.length; idx++) {
                    var equipmentHCHP = window.equipmentDailyHCHP && window.equipmentDailyHCHP[dataset.label];
                    var hcKwh = 0, hpKwh = 0, dayColor = null;
                    if (equipmentHCHP && equipmentHCHP[idx]) {
                        hcKwh = equipmentHCHP[idx].hc || 0;
                        hpKwh = equipmentHCHP[idx].hp || 0;
                        dayColor = equipmentHCHP[idx].day_color;
                    } else {
                        hpKwh = dataset.data[idx] || 0;
                    }
                    precalculatedCosts[dataset.label][idx] = calculateCost(hcKwh, hpKwh, dayColor);
                }
            });
        } else if (showCost) {
            // Mode monthly/yearly : calcul simplifié sans HC/HP
            chartData.datasets.forEach(function(dataset) {
                precalculatedCosts[dataset.label] = [];
                for (var idx = 0; idx < chartData.labels.length; idx++) {
                    var value = dataset.data[idx] || 0;
                    var costData = calculateCost(0, value, null);
                    precalculatedCosts[dataset.label][idx] = costData;
                }
            });
        }
        
        // Calculer le maximum pour l'échelle
        var maxDayTotal = 0;
        chartData.labels.forEach(function(label, idx) {
            var daySum = 0;
            chartData.datasets.forEach(function(dataset) {
                if (showCost) {
                    daySum += precalculatedCosts[dataset.label][idx].total || 0;
                } else {
                    daySum += dataset.data[idx] || 0;
                }
            });
            maxDayTotal = Math.max(maxDayTotal, daySum);
        });

        var html = '<div class="chart-bars">';
        chartData.labels.forEach(function(label, dayIndex) {
            var dayTotal = 0;
            var dayTotalCost = 0;
            var segmentsHtml = '';

            chartData.datasets.forEach(function(dataset, datasetIndex) {
                var value = dataset.data[dayIndex] || 0;
                if (value > 0) {
                    dayTotal += value;
                    
                    // Récupérer les données HC/HP pour cet équipement et ce jour (mode daily uniquement)
                    var hcKwh = 0, hpKwh = 0, dayColor = null;
                    
                    if (aggregationMode === 'daily') {
                        var equipmentHCHP = window.equipmentDailyHCHP && window.equipmentDailyHCHP[dataset.label];
                        if (equipmentHCHP && equipmentHCHP[dayIndex]) {
                            hcKwh = equipmentHCHP[dayIndex].hc || 0;
                            hpKwh = equipmentHCHP[dayIndex].hp || 0;
                            dayColor = equipmentHCHP[dayIndex].day_color;
                        } else {
                            hpKwh = value;
                        }
                    } else {
                        // Mode monthly/yearly : pas de détail HC/HP
                        hpKwh = value;
                    }
                    
                    // Utiliser le coût précalculé si disponible
                    var costData = (showCost && precalculatedCosts[dataset.label]) 
                        ? precalculatedCosts[dataset.label][dayIndex] 
                        : calculateCost(hcKwh, hpKwh, dayColor);
                    dayTotalCost += costData.total;
                    
                    // Calculer la hauteur en fonction du mode
                    var heightPercent;
                    if (showCost) {
                        heightPercent = maxDayTotal > 0 ? (costData.total / maxDayTotal) * 100 : 0;
                    } else {
                        heightPercent = maxDayTotal > 0 ? (value / maxDayTotal) * 100 : 0;
                    }
                    
                    // Créer le tooltip détaillé avec couleurs Tempo
                    var tooltipLines = ['<strong>' + dataset.label + '</strong>'];
                    tooltipLines.push('{{Total}} : ' + (Math.round(value * 100) / 100) + ' kWh (' + costData.total.toFixed(2) + ' € TTC)');
                    
                    // Détails HC/HP uniquement en mode daily
                    if (aggregationMode === 'daily') {
                        tooltipLines.push('------------------');
                        
                        var detailedEquipmentHCHP = window.equipmentDailyHCHP && window.equipmentDailyHCHP[dataset.label];
                        
                        // Vérifier s'il y a des périodes multiples (transition de couleur)
                        var periods = (detailedEquipmentHCHP && detailedEquipmentHCHP[dayIndex]) ? (detailedEquipmentHCHP[dayIndex].periods || []) : [];
                        
                        // Regrouper les consommations HC/HP par couleur
                        var consumptionByColor = {};
                        
                        if (periods.length > 0) {
                            periods.forEach(function(period) {
                                var periodColor = period.color;
                                if (!consumptionByColor[periodColor]) {
                                    consumptionByColor[periodColor] = { hc: 0, hp: 0 };
                                }
                                consumptionByColor[periodColor].hc += period.hc || 0;
                                consumptionByColor[periodColor].hp += period.hp || 0;
                            });
                        } else if (dayColor) {
                            // Fallback si pas de periods
                            consumptionByColor[dayColor] = { hc: hcKwh, hp: hpKwh };
                        }
                        
                        // Afficher HC et HP par couleur dans l'ordre CHRONOLOGIQUE
                        // Les periods sont déjà dans l'ordre chronologique (0-6h puis 6-24h)
                        // On parcourt les periods dans l'ordre pour respecter la chronologie
                        var displayedColors = new Set();
                        var totalDayKwh = value;
                        
                        if (periods.length > 0) {
                            // Utiliser l'ordre des periods (chronologique)
                            periods.forEach(function(period) {
                                var color = period.color;
                                
                                // Ne traiter chaque couleur qu'une seule fois
                                if (displayedColors.has(color)) {
                                    return;
                                }
                                displayedColors.add(color);
                                
                                var colorData = consumptionByColor[color];
                                if (!colorData) return;
                                
                                var colorEmoji = color === 'bleu' ? '🔵' : (color === 'blanc' ? '⚪' : '🔴');
                                
                                // Afficher HC d'abord (si > 0)
                                if (colorData.hc > 0) {
                                    var hcPercent = totalDayKwh > 0 ? ((colorData.hc / totalDayKwh) * 100).toFixed(1) : 0;
                                    var hcCostForColor = colorData.hc * parseFloat(window.tempoTariffs[color].hc);
                                    var hcTaxes = colorData.hc * 0.02998;
                                    var hcCostTTC = (hcCostForColor + hcTaxes) * 1.20;
                                    tooltipLines.push('HC ' + colorEmoji + ' ' + colorData.hc.toFixed(2) + ' kWh (' + hcPercent + '%)');
                                    tooltipLines.push('  ' + hcCostTTC.toFixed(2) + ' € TTC');
                                }
                                
                                // Puis HP (si > 0)
                                if (colorData.hp > 0) {
                                    var hpPercent = totalDayKwh > 0 ? ((colorData.hp / totalDayKwh) * 100).toFixed(1) : 0;
                                    var hpCostForColor = colorData.hp * parseFloat(window.tempoTariffs[color].hp);
                                    var hpTaxes = colorData.hp * 0.02998;
                                    var hpCostTTC = (hpCostForColor + hpTaxes) * 1.20;
                                    tooltipLines.push('HP ' + colorEmoji + ' ' + colorData.hp.toFixed(2) + ' kWh (' + hpPercent + '%)');
                                    tooltipLines.push('  ' + hpCostTTC.toFixed(2) + ' € TTC');
                                }
                            });
                        } else {
                            // Fallback : afficher la couleur unique
                            Object.keys(consumptionByColor).forEach(function(color) {
                                var colorData = consumptionByColor[color];
                                var colorEmoji = color === 'bleu' ? '🔵' : (color === 'blanc' ? '⚪' : '🔴');
                                
                                if (colorData.hc > 0) {
                                    var hcPercent = totalDayKwh > 0 ? ((colorData.hc / totalDayKwh) * 100).toFixed(1) : 0;
                                var hcCostForColor = colorData.hc * parseFloat(window.tempoTariffs[color].hc);
                                var hcTaxes = colorData.hc * 0.02998;
                                var hcCostTTC = (hcCostForColor + hcTaxes) * 1.20;
                                tooltipLines.push('HC ' + colorEmoji + ' ' + colorData.hc.toFixed(2) + ' kWh (' + hcPercent + '%)');
                                tooltipLines.push('  ' + hcCostTTC.toFixed(2) + ' € TTC');
                            }
                            
                            if (colorData.hp > 0) {
                                var hpPercent = totalDayKwh > 0 ? ((colorData.hp / totalDayKwh) * 100).toFixed(1) : 0;
                                var hpCostForColor = colorData.hp * parseFloat(window.tempoTariffs[color].hp);
                                var hpTaxes = colorData.hp * 0.02998;
                                var hpCostTTC = (hpCostForColor + hpTaxes) * 1.20;
                                tooltipLines.push('HP ' + colorEmoji + ' ' + colorData.hp.toFixed(2) + ' kWh (' + hpPercent + '%)');
                                tooltipLines.push('  ' + hpCostTTC.toFixed(2) + ' € TTC');
                            }
                        });
                    }
                    }
                    
                    var tooltipText = tooltipLines.join('<br>');
                    segmentsHtml += '<div class="chart-segment" style="height: ' + heightPercent + '%; background-color: ' + dataset.backgroundColor + '; border-color: ' + dataset.borderColor + ';" data-tooltip="' + tooltipText + '"></div>';
                }
            });

            var dayTotalFormatted = Math.round(dayTotal * 100) / 100 + ' kWh';
            
            // Récupérer les données calculées en PHP pour ce jour (inclut déjà l'abonnement)
            // Disponible pour tous les modes maintenant
            var dayData = window.dailyTotals ? window.dailyTotals[label] : null;
            var dayCost = 0;
            var subscriptionCost = 0;
            var totalHC = 0, totalHP = 0;
            var totalKwh = dayTotal; // Définir totalKwh pour les calculs de pourcentage
            var dayColor = null;
            
            if (dayData) {
                // Utiliser les valeurs calculées en PHP pour garantir la cohérence
                dayCost = parseFloat(dayData.cost_total) || 0;
                totalHC = parseFloat(dayData.hc) || 0;
                totalHP = parseFloat(dayData.hp) || 0;
                totalKwh = parseFloat(dayData.total) || dayTotal;
                dayColor = dayData.day_color;
                subscriptionCost = parseFloat(dayData.cost_subscription) || 0;
            } else {
                // Fallback : calculer si dailyTotals n'est pas disponible (ou mode monthly/yearly)
                if (aggregationMode === 'daily') {
                    chartData.datasets.forEach(function(dataset) {
                        var equipmentHCHP = window.equipmentDailyHCHP && window.equipmentDailyHCHP[dataset.label];
                    if (equipmentHCHP && equipmentHCHP[dayIndex]) {
                        var hcKwh = equipmentHCHP[dayIndex].hc || 0;
                        var hpKwh = equipmentHCHP[dayIndex].hp || 0;
                        dayColor = equipmentHCHP[dayIndex].day_color || dayColor;
                        
                        totalHC += hcKwh;
                        totalHP += hpKwh;
                        
                        var costData = calculateCost(hcKwh, hpKwh, dayColor);
                        dayCost += costData.total;
                    }
                    });
                    
                    subscriptionCost = parseFloat(window.subscriptionDailyCost) || 0;
                    dayCost += subscriptionCost;
                } else {
                    // Mode monthly/yearly : calcul simple
                    subscriptionCost = parseFloat(window.subscriptionDailyCost) || 0;
                    if (aggregationMode === 'monthly') {
                        subscriptionCost *= 30;
                    } else if (aggregationMode === 'yearly') {
                        subscriptionCost *= 365;
                    }
                    dayCost = dayTotalCost + subscriptionCost;
                }
            }
            
            var dayCostFormatted = dayCost.toFixed(2) + ' €';
            
            // Créer le tooltip pour les totaux du jour (chart-bar-value et chart-bar-cost)
            var dayTooltipLines = [];
            var periodLabel = getPeriodDescription(label, aggregationMode);
            dayTooltipLines.push('<strong>' + periodLabel + '</strong>');
            dayTooltipLines.push('{{Total}} : ' + dayTotalFormatted + ' (' + dayCostFormatted + ')');
            
            // Calculer et afficher les frais fixes (abonnement + CTA + TVA sur ces frais)
            if (dayData) {
                var energyCostHCHP = parseFloat(dayData.cost_hc_ttc || 0) + parseFloat(dayData.cost_hp_ttc || 0);
                var fixedCosts = dayCost - energyCostHCHP;
                if (fixedCosts > 0.01) {
                   // dayTooltipLines.push('   Énergie: ' + energyCostHCHP.toFixed(2) + ' €');
                    dayTooltipLines.push('   {{dont abonnement}} : ' + fixedCosts.toFixed(2) + ' €');
                }
            }
            dayTooltipLines.push('========================');
            
            // Afficher les détails HC/HP par PÉRIODE si disponible (pour Tempo avec transition ou aggregation)
            if (dayData && dayData.periods && Object.keys(dayData.periods).length > 0) {
                // Il y a des périodes définies (transition de couleur en daily ou aggregation monthly/yearly)
                var periods = dayData.periods;
                
                // Parcourir les périodes dans l'ordre chronologique
                Object.keys(periods).forEach(function(color) {
                    var period = periods[color];
                    var colorEmoji = color === 'bleu' ? '🔵' : (color === 'blanc' ? '⚪' : '🔴');
                    
                    if (period.hc > 0) {
                        var hcPercent = totalKwh > 0 ? ((period.hc / totalKwh) * 100).toFixed(1) : 0;
                        dayTooltipLines.push('HC ' + colorEmoji + ' ' + period.hc.toFixed(2) + ' kWh (' + hcPercent + '%)');
                        // Afficher le coût si disponible (mode monthly/yearly)
                        if (period.cost_hc !== undefined && period.cost_hc > 0) {
                            dayTooltipLines.push('  ' + period.cost_hc.toFixed(2) + ' €');
                        }
                    }
                    
                    if (period.hp > 0) {
                        var hpPercent = totalKwh > 0 ? ((period.hp / totalKwh) * 100).toFixed(1) : 0;
                        dayTooltipLines.push('HP ' + colorEmoji + ' ' + period.hp.toFixed(2) + ' kWh (' + hpPercent + '%)');
                        // Afficher le coût si disponible (mode monthly/yearly)
                        if (period.cost_hp !== undefined && period.cost_hp > 0) {
                            dayTooltipLines.push('  ' + period.cost_hp.toFixed(2) + ' €');
                        }
                    }
                });
                
                // Afficher les coûts globaux HC/HP
                var hcCostTTC = parseFloat(dayData.cost_hc_ttc || 0);
                var hpCostTTC = parseFloat(dayData.cost_hp_ttc || 0);
                
                if (totalHC > 0) {
                    dayTooltipLines.push('{{Total HC}} : ' + hcCostTTC.toFixed(2) + ' €');
                }
                if (totalHP > 0) {
                    dayTooltipLines.push('{{Total HP}} : ' + hpCostTTC.toFixed(2) + ' €');
                }
            } else if (dayData && (totalHC > 0 || totalHP > 0)) {
                // Pas de périodes : affichage simple (daily avec HC/HP ou monthly/yearly)
                var hcPercent = parseFloat(dayData.hc_percent || 0);
                var hpPercent = parseFloat(dayData.hp_percent || 0);
                var summaryHcCostTTC = parseFloat(dayData.cost_hc_ttc || 0);
                var summaryHpCostTTC = parseFloat(dayData.cost_hp_ttc || 0);
                
                var colorEmoji = dayColor === 'bleu' ? '🔵' : (dayColor === 'blanc' ? '⚪' : '🔴');
                
                if (totalHC > 0) {
                    dayTooltipLines.push('HC ' + colorEmoji + ' ' + totalHC.toFixed(2) + ' kWh (' + hcPercent + '%)');
                    dayTooltipLines.push('  ' + summaryHcCostTTC.toFixed(2) + ' €');
                }
                
                if (totalHP > 0) {
                    // En mode monthly/yearly, pas d'emoji de couleur car période agrégée
                    var hpLabel = (aggregationMode === 'daily' && dayColor) 
                        ? ('HP ' + colorEmoji + ' ') 
                        : 'HP ';
                    dayTooltipLines.push(hpLabel + totalHP.toFixed(2) + ' kWh (' + hpPercent + '%)');
                    dayTooltipLines.push('  ' + summaryHpCostTTC.toFixed(2) + ' €');
                }
            }
            
            var dayTooltip = dayTooltipLines.join('<br>');
            
            var displayPeriodLabel = getPeriodDescription(label, aggregationMode);
            
            html += '<div class="chart-bar-container">' +
                    '<div class="chart-bar-stack">' + 
                    '<div class="chart-bar-display">' +
                    '<div class="chart-bar-cost" data-tooltip="' + dayTooltip + '">' + dayCostFormatted + '</div>' +
                    '<div class="chart-bar-value" data-tooltip="' + dayTooltip + '">' + dayTotalFormatted + '</div>' +
                    '</div>' +
                    segmentsHtml + 
                    '</div>' +
                    '<div class="chart-bar-label">' + displayPeriodLabel + '</div>' +
                    '</div>';
        });
        html += '</div>';
        return html;
    }

    // Générer graphique camembert
    function generatePieChart(chartData) {
        // Déterminer si on affiche en € ou en kWh
        var toggleBtn = document.getElementById('toggleValueType');
        var checkbox = toggleBtn ? toggleBtn.querySelector('input[type="checkbox"]') : null;
        var showCost = checkbox && checkbox.checked;
        
        var equipmentTotals = [];
        var grandTotalKwh = 0;
        var grandTotalCost = 0;
        var tariffType = window.tariffType || 'base';

        chartData.datasets.forEach(function(dataset, index) {
            var totalKwh = dataset.data.reduce(function(sum, val) { return sum + (val || 0); }, 0);
            if (totalKwh > 0) {
                var equipmentCost = window.equipmentCosts && window.equipmentCosts[dataset.label];
                var cost = equipmentCost ? equipmentCost.total : 0;
                
                // Calculer les détails HC/HP pour cet équipement sur toute la période
                var totalHC = 0, totalHP = 0;
                var hcCost = 0, hpCost = 0;
                var colorBreakdown = {}; // Pour Tempo : répartition par couleur
                
                var equipmentHCHP = window.equipmentDailyHCHP && window.equipmentDailyHCHP[dataset.label];
                if (equipmentHCHP) {
                    Object.keys(equipmentHCHP).forEach(function(dayIndex) {
                        var dayData = equipmentHCHP[dayIndex];
                        totalHC += dayData.hc || 0;
                        totalHP += dayData.hp || 0;
                        
                        // Calculer le coût
                        var dayColor = dayData.day_color;
                        var costData = calculateCost(dayData.hc || 0, dayData.hp || 0, dayColor);
                        hcCost += costData.hc_cost || 0;
                        hpCost += costData.hp_cost || 0;
                        
                        // Pour Tempo : agréger par couleur
                        if (tariffType === 'tempo' && dayColor) {
                            if (!colorBreakdown[dayColor]) {
                                colorBreakdown[dayColor] = { hc: 0, hp: 0, hcCost: 0, hpCost: 0 };
                            }
                            colorBreakdown[dayColor].hc += dayData.hc || 0;
                            colorBreakdown[dayColor].hp += dayData.hp || 0;
                            colorBreakdown[dayColor].hcCost += costData.hc_cost || 0;
                            colorBreakdown[dayColor].hpCost += costData.hp_cost || 0;
                        }
                    });
                }
                
                equipmentTotals.push({
                    label: dataset.label,
                    totalKwh: totalKwh,
                    totalCost: cost,
                    totalHC: totalHC,
                    totalHP: totalHP,
                    hcCost: hcCost,
                    hpCost: hpCost,
                    colorBreakdown: colorBreakdown,
                    color: dataset.backgroundColor,
                    borderColor: dataset.borderColor
                });
                grandTotalKwh += totalKwh;
                grandTotalCost += cost;
            }
        });

        // Trier par coût en mode €, sinon par kWh
        if (showCost) {
            equipmentTotals.sort(function(a, b) { return b.totalCost - a.totalCost; });
        }

        var svgPaths = '';
        var currentAngle = 0;

        equipmentTotals.forEach(function(equipment) {
            // Calculer l'angle basé sur le toggle
            var percentage = showCost 
                ? (grandTotalCost > 0 ? (equipment.totalCost / grandTotalCost) * 100 : 0)
                : (grandTotalKwh > 0 ? (equipment.totalKwh / grandTotalKwh) * 100 : 0);
            var angle = (percentage / 100) * 360;
            var endAngle = currentAngle + angle;

            var startAngleRad = (currentAngle - 90) * Math.PI / 180;
            var endAngleRad = (endAngle - 90) * Math.PI / 180;

            var startX = 100 + 80 * Math.cos(startAngleRad);
            var startY = 100 + 80 * Math.sin(startAngleRad);
            var endX = 100 + 80 * Math.cos(endAngleRad);
            var endY = 100 + 80 * Math.sin(endAngleRad);

            var largeArc = angle > 180 ? 1 : 0;
            
            // Construire le tooltip détaillé comme pour les barres empilées
            var tooltipLines = [];
            tooltipLines.push('<strong>' + equipment.label + '</strong>');
            tooltipLines.push('{{Total}} : ' + equipment.totalKwh.toFixed(2) + ' kWh (' + equipment.totalCost.toFixed(2) + ' € TTC)');
            tooltipLines.push('------------------');
            
            // Afficher les détails HC/HP
            if (tariffType === 'tempo' && Object.keys(equipment.colorBreakdown).length > 0) {
                // Pour Tempo : afficher par couleur
                var colors = ['bleu', 'blanc', 'rouge'];
                colors.forEach(function(color) {
                    if (equipment.colorBreakdown[color]) {
                        var colorData = equipment.colorBreakdown[color];
                        var colorEmoji = color === 'bleu' ? '🔵' : (color === 'blanc' ? '⚪' : '🔴');
                        
                        if (colorData.hc > 0) {
                            var hcPercent = equipment.totalKwh > 0 ? ((colorData.hc / equipment.totalKwh) * 100).toFixed(1) : 0;
                            tooltipLines.push('HC ' + colorEmoji + ' ' + colorData.hc.toFixed(2) + ' kWh (' + hcPercent + '%)');
                            tooltipLines.push('  ' + colorData.hcCost.toFixed(2) + ' € TTC');
                        }
                        
                        if (colorData.hp > 0) {
                            var hpPercent = equipment.totalKwh > 0 ? ((colorData.hp / equipment.totalKwh) * 100).toFixed(1) : 0;
                            tooltipLines.push('HP ' + colorEmoji + ' ' + colorData.hp.toFixed(2) + ' kWh (' + hpPercent + '%)');
                            tooltipLines.push('  ' + colorData.hpCost.toFixed(2) + ' € TTC');
                        }
                    }
                });
            } else {
                // Pour HP/HC ou Base : affichage simple
                if (equipment.totalHC > 0) {
                    var hcPercent = equipment.totalKwh > 0 ? ((equipment.totalHC / equipment.totalKwh) * 100).toFixed(1) : 0;
                    tooltipLines.push('HC ' + equipment.totalHC.toFixed(2) + ' kWh (' + hcPercent + '%)');
                    tooltipLines.push('  ' + equipment.hcCost.toFixed(2) + ' € TTC');
                }
                
                if (equipment.totalHP > 0) {
                    var hpPercent = equipment.totalKwh > 0 ? ((equipment.totalHP / equipment.totalKwh) * 100).toFixed(1) : 0;
                    var hpLabel = (tariffType === 'base') ? '' : 'HP ';
                    tooltipLines.push(hpLabel + equipment.totalHP.toFixed(2) + ' kWh (' + hpPercent + '%)');
                    tooltipLines.push('  ' + equipment.hpCost.toFixed(2) + ' € TTC');
                }
            }
            
            var tooltipText = tooltipLines.join('<br>');

            svgPaths += '<path d="M 100 100 L ' + startX + ' ' + startY + ' A 80 80 0 ' + largeArc + ' 1 ' + endX + ' ' + endY + ' Z" ' +
                       'fill="' + equipment.color + '" stroke="' + equipment.borderColor + '" stroke-width="2" class="pie-slice" ' +
                       'data-tooltip="' + tooltipText + '" data-label="' + equipment.label + '" ' +
                       'data-kwh="' + equipment.totalKwh.toFixed(2) + '" data-cost="' + equipment.totalCost.toFixed(2) + '"></path>';

            currentAngle = endAngle;
        });
        
        // Créer le tooltip détaillé du total en agrégeant les données de tous les jours
        var periodData = {
            total: grandTotalKwh,
            cost_hc_ttc: 0,
            cost_hp_ttc: 0,
            hc: 0,
            hp: 0,
            periods: {}
        };
        
        // Agréger les données de tous les jours
        if (window.dailyTotals) {
            Object.keys(window.dailyTotals).forEach(function(dayLabel) {
                var dayData = window.dailyTotals[dayLabel];
                periodData.cost_hc_ttc += parseFloat(dayData.cost_hc_ttc) || 0;
                periodData.cost_hp_ttc += parseFloat(dayData.cost_hp_ttc) || 0;
                periodData.hc += parseFloat(dayData.hc) || 0;
                periodData.hp += parseFloat(dayData.hp) || 0;
                
                // Agréger les périodes si elles existent
                if (dayData.periods) {
                    Object.keys(dayData.periods).forEach(function(periodKey) {
                        var period = dayData.periods[periodKey];
                        var color = period.color;
                        if (!periodData.periods[color]) {
                            periodData.periods[color] = { color: color, hc: 0, hp: 0 };
                        }
                        periodData.periods[color].hc += parseFloat(period.hc) || 0;
                        periodData.periods[color].hp += parseFloat(period.hp) || 0;
                    });
                } else if (dayData.day_color) {
                    // Jour unicolore
                    var color = dayData.day_color;
                    if (!periodData.periods[color]) {
                        periodData.periods[color] = { color: color, hc: 0, hp: 0 };
                    }
                    periodData.periods[color].hc += parseFloat(dayData.hc) || 0;
                    periodData.periods[color].hp += parseFloat(dayData.hp) || 0;
                }
            });
        }
        
        var totalTooltip = generateDetailedTooltip('{{Total période}}', grandTotalKwh, grandTotalCost, periodData);
        
        return '<div class="chart-pie">' +
               '<div class="pie-chart-wrapper">' +
               '<div class="pie-center-kwh" data-tooltip="' + totalTooltip + '">' + grandTotalKwh.toFixed(2) + ' kWh</div>' +
               '<div class="pie-center-cost" data-tooltip="' + totalTooltip + '" style="display: none;">' + grandTotalCost.toFixed(2) + ' €</div>' +
               '<div class="pie-container"><svg viewBox="0 0 200 200" class="pie-chart">' + svgPaths + '</svg></div>' +
               '</div>' +
               '</div>';
    }

    // Générer camembert par période (jour/mois/année selon agrégation)
    function generateDailyPieChart(chartData) {
        var toggleBtn = document.getElementById('toggleValueType');
        var checkbox = toggleBtn ? toggleBtn.querySelector('input[type="checkbox"]') : null;
        var showCost = checkbox && checkbox.checked;
        
        var html = '<div class="daily-pies-container">';
        
        // Pour chaque période, créer un petit camembert
        chartData.labels.forEach(function(label, dayIndex) {
            var periodLabel = getPeriodDescription(label, aggregationMode);
            var dayTotal = 0;
            var dayTotalCost = 0;
            var equipments = [];
            
            chartData.datasets.forEach(function(dataset) {
                var value = dataset.data[dayIndex] || 0;
                if (value > 0) {
                    // Récupérer les données HC/HP pour cet équipement et ce jour (mode daily uniquement)
                    var hcKwh = 0, hpKwh = 0, dayColor = null;
                    
                    if (aggregationMode === 'daily') {
                        var equipmentHCHP = window.equipmentDailyHCHP && window.equipmentDailyHCHP[dataset.label];
                        if (equipmentHCHP && equipmentHCHP[dayIndex]) {
                            hcKwh = equipmentHCHP[dayIndex].hc || 0;
                            hpKwh = equipmentHCHP[dayIndex].hp || 0;
                            dayColor = equipmentHCHP[dayIndex].day_color;
                        } else {
                            hpKwh = value;
                        }
                    } else {
                        // Mode monthly/yearly
                        hpKwh = value;
                    }
                    
                    var costData = calculateCost(hcKwh, hpKwh, dayColor);
                    
                    equipments.push({
                        label: dataset.label,
                        value: value,
                        hcKwh: hcKwh,
                        hpKwh: hpKwh,
                        dayColor: dayColor,
                        cost: costData.total,
                        color: dataset.backgroundColor,
                        borderColor: dataset.borderColor,
                        equipmentHCHP: equipmentHCHP && equipmentHCHP[dayIndex]
                    });
                    dayTotal += value;
                    dayTotalCost += costData.total;
                }
            });
            
            if (dayTotal > 0) {
                var svgPaths = '';
                var currentAngle = 0;
                
                equipments.forEach(function(equipment) {
                    // Calculer le pourcentage en fonction du mode (kWh ou €)
                    var percentage = showCost 
                        ? (dayTotalCost > 0 ? (equipment.cost / dayTotalCost) * 100 : 0)
                        : (dayTotal > 0 ? (equipment.value / dayTotal) * 100 : 0);
                    var angle = (percentage / 100) * 360;
                    var endAngle = currentAngle + angle;
                    
                    var startAngleRad = (currentAngle - 90) * Math.PI / 180;
                    var endAngleRad = (endAngle - 90) * Math.PI / 180;
                    
                    var startX = 50 + 40 * Math.cos(startAngleRad);
                    var startY = 50 + 40 * Math.sin(startAngleRad);
                    var endX = 50 + 40 * Math.cos(endAngleRad);
                    var endY = 50 + 40 * Math.sin(endAngleRad);
                    
                    var largeArc = angle > 180 ? 1 : 0;
                    
                    // Créer le tooltip détaillé comme pour les barres empilées
                    var tooltipLines = ['<strong>' + equipment.label + '</strong>'];
                    tooltipLines.push('{{Total}} : ' + (Math.round(equipment.value * 100) / 100) + ' kWh (' + equipment.cost.toFixed(2) + ' € TTC)');
                    tooltipLines.push('------------------');
                    
                    var tariffType = window.tariffType || 'base';
                    
                    if (tariffType === 'tempo' && equipment.dayColor) {
                        var periods = equipment.equipmentHCHP ? equipment.equipmentHCHP.periods || [] : [];
                        var consumptionByColor = {};
                        
                        if (periods.length > 0) {
                            periods.forEach(function(period) {
                                var periodColor = period.color;
                                if (!consumptionByColor[periodColor]) {
                                    consumptionByColor[periodColor] = { hc: 0, hp: 0 };
                                }
                                consumptionByColor[periodColor].hc += period.hc || 0;
                                consumptionByColor[periodColor].hp += period.hp || 0;
                            });
                        } else {
                            consumptionByColor[equipment.dayColor] = { hc: equipment.hcKwh, hp: equipment.hpKwh };
                        }
                        
                        var displayedColors = new Set();
                        
                        if (periods.length > 0) {
                            periods.forEach(function(period) {
                                var color = period.color;
                                if (displayedColors.has(color)) return;
                                displayedColors.add(color);
                                
                                var colorData = consumptionByColor[color];
                                if (!colorData) return;
                                
                                var colorEmoji = color === 'bleu' ? '🔵' : (color === 'blanc' ? '⚪' : '🔴');
                                
                                if (colorData.hc > 0) {
                                    var hcPercent = equipment.value > 0 ? ((colorData.hc / equipment.value) * 100).toFixed(1) : 0;
                                    var hcCostForColor = colorData.hc * parseFloat(window.tempoTariffs[color].hc);
                                    var hcTaxes = colorData.hc * 0.02998;
                                    var hcCostTTC = (hcCostForColor + hcTaxes) * 1.20;
                                    tooltipLines.push('HC ' + colorEmoji + ' ' + colorData.hc.toFixed(2) + ' kWh (' + hcPercent + '%)');
                                    tooltipLines.push('  ' + hcCostTTC.toFixed(2) + ' € TTC');
                                }
                                
                                if (colorData.hp > 0) {
                                    var hpPercent = equipment.value > 0 ? ((colorData.hp / equipment.value) * 100).toFixed(1) : 0;
                                    var hpCostForColor = colorData.hp * parseFloat(window.tempoTariffs[color].hp);
                                    var hpTaxes = colorData.hp * 0.02998;
                                    var hpCostTTC = (hpCostForColor + hpTaxes) * 1.20;
                                    tooltipLines.push('HP ' + colorEmoji + ' ' + colorData.hp.toFixed(2) + ' kWh (' + hpPercent + '%)');
                                    tooltipLines.push('  ' + hpCostTTC.toFixed(2) + ' € TTC');
                                }
                            });
                        } else {
                            Object.keys(consumptionByColor).forEach(function(color) {
                                var colorData = consumptionByColor[color];
                                var colorEmoji = color === 'bleu' ? '🔵' : (color === 'blanc' ? '⚪' : '🔴');
                                
                                if (colorData.hc > 0) {
                                    var hcPercent = equipment.value > 0 ? ((colorData.hc / equipment.value) * 100).toFixed(1) : 0;
                                    var hcCostForColor = colorData.hc * parseFloat(window.tempoTariffs[color].hc);
                                    var hcTaxes = colorData.hc * 0.02998;
                                    var hcCostTTC = (hcCostForColor + hcTaxes) * 1.20;
                                    tooltipLines.push('HC ' + colorEmoji + ' ' + colorData.hc.toFixed(2) + ' kWh (' + hcPercent + '%)');
                                    tooltipLines.push('  ' + hcCostTTC.toFixed(2) + ' € TTC');
                                }
                                
                                if (colorData.hp > 0) {
                                    var hpPercent = equipment.value > 0 ? ((colorData.hp / equipment.value) * 100).toFixed(1) : 0;
                                    var hpCostForColor = colorData.hp * parseFloat(window.tempoTariffs[color].hp);
                                    var hpTaxes = colorData.hp * 0.02998;
                                    var hpCostTTC = (hpCostForColor + hpTaxes) * 1.20;
                                    tooltipLines.push('HP ' + colorEmoji + ' ' + colorData.hp.toFixed(2) + ' kWh (' + hpPercent + '%)');
                                    tooltipLines.push('  ' + hpCostTTC.toFixed(2) + ' € TTC');
                                }
                            });
                        }
                    } else if (tariffType === 'hphc') {
                        if (equipment.hcKwh > 0) {
                            var hcPercent = equipment.value > 0 ? ((equipment.hcKwh / equipment.value) * 100).toFixed(1) : 0;
                            var hcRate = window.hphcTariffs ? parseFloat(window.hphcTariffs.hc) : 0.1256;
                            var hcCost = equipment.hcKwh * hcRate;
                            tooltipLines.push('HC: ' + equipment.hcKwh.toFixed(2) + ' kWh (' + hcPercent + '%)');
                            tooltipLines.push('  ' + hcCost.toFixed(2) + ' € TTC');
                        }
                        if (equipment.hpKwh > 0) {
                            var hpPercent = equipment.value > 0 ? ((equipment.hpKwh / equipment.value) * 100).toFixed(1) : 0;
                            var hpRate = window.hphcTariffs ? parseFloat(window.hphcTariffs.hp) : 0.1808;
                            var hpCost = equipment.hpKwh * hpRate;
                            tooltipLines.push('HP: ' + equipment.hpKwh.toFixed(2) + ' kWh (' + hpPercent + '%)');
                            tooltipLines.push('  ' + hpCost.toFixed(2) + ' € TTC');
                        }
                    }
                    
                    var tooltipText = tooltipLines.join('<br>');
                    
                    svgPaths += '<path d="M 50 50 L ' + startX + ' ' + startY + ' A 40 40 0 ' + largeArc + ' 1 ' + endX + ' ' + endY + ' Z" ' +
                               'fill="' + equipment.color + '" stroke="' + equipment.borderColor + '" stroke-width="1" class="pie-slice" ' +
                               'data-tooltip="' + tooltipText + '" data-label="' + equipment.label + '"></path>';
                    
                    currentAngle = endAngle;
                });
                
                // Récupérer les données détaillées du jour depuis window.dailyTotals
                var dayData = window.dailyTotals && window.dailyTotals[label];
                var dayTooltip = generateDetailedTooltip(periodLabel, dayTotal, dayTotalCost, dayData);
                
                html += '<div class="daily-pie-item">' +
                        '<div class="daily-pie-kwh" data-tooltip="' + dayTooltip + '">' + dayTotal.toFixed(2) + ' kWh</div>' +
                        '<div class="daily-pie-cost" data-tooltip="' + dayTooltip + '" style="display: none;">' + dayTotalCost.toFixed(2) + ' €</div>' +
                        '<svg viewBox="0 0 100 100" class="pie-chart">' + svgPaths + '</svg>' +
                        '<div class="daily-pie-date">' + periodLabel + '</div>' +
                        '</div>';
            }
        });
        
        html += '</div>';
        return html;
    }

    // Générer graphique barres groupées
    function generateGroupedChart(chartData) {
        // Déterminer si on affiche en € ou en kWh
        var toggleBtn = document.getElementById('toggleValueType');
        var checkbox = toggleBtn ? toggleBtn.querySelector('input[type="checkbox"]') : null;
        var showCost = checkbox && checkbox.checked;
        
        var maxValue = 0;
        var maxCost = 0;
        
        // Calculer le max parmi TOUTES les barres individuelles (pas les totaux des jours)
        chartData.datasets.forEach(function(dataset) {
            chartData.labels.forEach(function(label, dayIndex) {
                var value = dataset.data[dayIndex] || 0;
                maxValue = Math.max(maxValue, value);
                
                var equipmentCost = window.equipmentCosts && window.equipmentCosts[dataset.label];
                if (equipmentCost) {
                    var totalEquipmentValue = dataset.data.reduce(function(sum, val) { return sum + (val || 0); }, 0);
                    if (totalEquipmentValue > 0) {
                        var cost = (value / totalEquipmentValue) * equipmentCost.total;
                        maxCost = Math.max(maxCost, cost);
                    }
                }
            });
        });

        var html = '<div class="grouped-bars-container">';
        chartData.labels.forEach(function(label, dayIndex) {
            var periodLabel = getPeriodDescription(label, aggregationMode);
            
            // Calculer le total kWh et le coût total du jour
            var dayTotal = 0;
            var dayCost = 0;
            chartData.datasets.forEach(function(dataset) {
                var value = dataset.data[dayIndex] || 0;
                dayTotal += value;
                var equipmentCost = window.equipmentCosts && window.equipmentCosts[dataset.label];
                if (equipmentCost) {
                    var totalEquipmentValue = dataset.data.reduce(function(sum, val) { return sum + (val || 0); }, 0);
                    if (totalEquipmentValue > 0) {
                        dayCost += (value / totalEquipmentValue) * equipmentCost.total;
                    }
                }
            });
            
            // Ajouter l'abonnement quotidien une seule fois par période (vue groupée)
            var subscriptionCost = parseFloat(window.subscriptionDailyCost) || 0;
            // Pour les mois/années, multiplier l'abonnement en fonction de la période
            if (aggregationMode === 'monthly') {
                subscriptionCost *= 30; // Approximation 30 jours
            } else if (aggregationMode === 'yearly') {
                subscriptionCost *= 365;
            }
            dayCost += subscriptionCost;
            
            var dayKwhFormatted = dayTotal.toFixed(2) + ' kWh';
            var dayCostFormatted = dayCost.toFixed(2) + ' €';
            
            // Récupérer les données détaillées du jour depuis window.dailyTotals
            var dayData = window.dailyTotals && window.dailyTotals[label];
            var dayTooltip = generateDetailedTooltip(periodLabel, dayTotal, dayCost, dayData);
            
            html += '<div class="grouped-day">' +
                    '<div class="grouped-kwh" data-tooltip="' + dayTooltip + '">' + dayKwhFormatted + '</div>' +
                    '<div class="grouped-cost" data-tooltip="' + dayTooltip + '" style="display: none;">' + dayCostFormatted + '</div>' +
                    '<div class="grouped-bars">';
            chartData.datasets.forEach(function(dataset, datasetIndex) {
                var value = dataset.data[dayIndex] || 0;
                var equipmentCost = window.equipmentCosts && window.equipmentCosts[dataset.label];
                var totalEquipmentValue = dataset.data.reduce(function(sum, val) { return sum + (val || 0); }, 0);
                var cost = equipmentCost && totalEquipmentValue > 0 ? ((value / totalEquipmentValue) * equipmentCost.total) : 0;
                
                // Calculer la hauteur en fonction du toggle
                var heightPercent = showCost
                    ? (maxCost > 0 ? (cost / maxCost) * 100 : 0)
                    : (maxValue > 0 ? (value / maxValue) * 100 : 0);
                
                // Créer un tooltip détaillé pour cette barre individuelle
                var tooltipLines = ['<strong>' + dataset.label + '</strong>'];
                tooltipLines.push('{{Total}} : ' + value.toFixed(2) + ' kWh (' + cost.toFixed(2) + ' €)');
                
                // Détails HC/HP uniquement en mode daily
                if (aggregationMode === 'daily') {
                    var equipmentHCHP = window.equipmentDailyHCHP && window.equipmentDailyHCHP[dataset.label];
                    if (equipmentHCHP && equipmentHCHP[dayIndex]) {
                        var hcKwh = equipmentHCHP[dayIndex].hc || 0;
                        var hpKwh = equipmentHCHP[dayIndex].hp || 0;
                        var dayColor = equipmentHCHP[dayIndex].day_color;
                        var tariffType = window.tariffType || 'base';
                        
                        if (tariffType === 'tempo' && dayColor) {
                        var colorEmoji = dayColor === 'bleu' ? '🔵' : (dayColor === 'blanc' ? '⚪' : '🔴');
                        if (hcKwh > 0) {
                            var hcPercent = value > 0 ? ((hcKwh / value) * 100).toFixed(1) : 0;
                            tooltipLines.push('HC ' + colorEmoji + ' ' + hcKwh.toFixed(2) + ' kWh (' + hcPercent + '%)');
                        }
                        if (hpKwh > 0) {
                            var hpPercent = value > 0 ? ((hpKwh / value) * 100).toFixed(1) : 0;
                            tooltipLines.push('HP ' + colorEmoji + ' ' + hpKwh.toFixed(2) + ' kWh (' + hpPercent + '%)');
                        }
                    } else if (tariffType === 'hphc') {
                        if (hcKwh > 0) {
                            var hphcHcPercent = value > 0 ? ((hcKwh / value) * 100).toFixed(1) : 0;
                            tooltipLines.push('HC ' + hcKwh.toFixed(2) + ' kWh (' + hphcHcPercent + '%)');
                        }
                        if (hpKwh > 0) {
                            var hphcHpPercent = value > 0 ? ((hpKwh / value) * 100).toFixed(1) : 0;
                            tooltipLines.push('HP ' + hpKwh.toFixed(2) + ' kWh (' + hphcHpPercent + '%)');
                        }
                    }
                    }
                }
                
                var tooltipText = tooltipLines.join('<br>');
                html += '<div class="grouped-bar" style="height: ' + heightPercent + '%; background-color: ' + dataset.backgroundColor + ';" data-tooltip="' + tooltipText + '"></div>';
            });
            html += '</div><div class="grouped-label">' + periodLabel + '</div></div>';
        });
        html += '</div>';
        return html;
    }

    // Générer graphique barres empilées total (une seule barre pour toute la période)
    function generateStackedTotalChart(chartData) {
        var toggleBtn = document.getElementById('toggleValueType');
        var checkbox = toggleBtn ? toggleBtn.querySelector('input[type="checkbox"]') : null;
        var showCost = checkbox && checkbox.checked;
        
        var equipmentTotals = [];
        var grandTotalKwh = 0;
        var grandTotalCost = 0;
        
        chartData.datasets.forEach(function(dataset) {
            var totalKwh = dataset.data.reduce(function(sum, val) { return sum + (val || 0); }, 0);
            if (totalKwh > 0) {
                var equipmentCost = window.equipmentCosts && window.equipmentCosts[dataset.label];
                var cost = equipmentCost ? equipmentCost.total : 0;
                
                equipmentTotals.push({
                    label: dataset.label,
                    value: totalKwh,
                    cost: cost,
                    color: dataset.backgroundColor,
                    borderColor: dataset.borderColor
                });
                
                grandTotalKwh += totalKwh;
                grandTotalCost += cost;
            }
        });
        
        // Créer le tooltip détaillé du total en agrégeant les données de tous les jours
        var periodData = {
            total: grandTotalKwh,
            cost_hc_ttc: 0,
            cost_hp_ttc: 0,
            hc: 0,
            hp: 0,
            periods: {}
        };
        
        // Agréger les données de tous les jours
        if (window.dailyTotals) {
            Object.keys(window.dailyTotals).forEach(function(dateKey) {
                var dayData = window.dailyTotals[dateKey];
                periodData.cost_hc_ttc += parseFloat(dayData.cost_hc_ttc || 0);
                periodData.cost_hp_ttc += parseFloat(dayData.cost_hp_ttc || 0);
                periodData.hc += parseFloat(dayData.hc || 0);
                periodData.hp += parseFloat(dayData.hp || 0);
                
                // Agréger les périodes Tempo si présentes
                if (dayData.periods && Object.keys(dayData.periods).length > 0) {
                    Object.keys(dayData.periods).forEach(function(periodKey) {
                        var period = dayData.periods[periodKey];
                        var key = period.color + '_' + periodKey.split('_')[0]; // bleu_period1, blanc_period2, etc.
                        
                        if (!periodData.periods[key]) {
                            periodData.periods[key] = {
                                color: period.color,
                                hc: 0,
                                hp: 0
                            };
                        }
                        
                        periodData.periods[key].hc += parseFloat(period.hc || 0);
                        periodData.periods[key].hp += parseFloat(period.hp || 0);
                    });
                }
            });
        }
        
        var totalTooltip = generateDetailedTooltip('{{Total période}}', grandTotalKwh, grandTotalCost, periodData);
        
        var periodLabel = aggregationMode === 'monthly' ? '{{Total mois}}' : (aggregationMode === 'yearly' ? '{{Total années}}' : '{{Période totale}}');
        
        var html = '<div class="chart-bars"><div class="chart-bar">';
        html += '<div class="chart-bar-total" data-tooltip="' + totalTooltip + '">' + (showCost ? grandTotalCost.toFixed(2) + ' €' : grandTotalKwh.toFixed(2) + ' kWh') + '</div>';
        html += '<div class="chart-segments">';
        
        equipmentTotals.forEach(function(equipment) {
            var heightPercent = showCost 
                ? (grandTotalCost > 0 ? (equipment.cost / grandTotalCost) * 100 : 0)
                : (grandTotalKwh > 0 ? (equipment.value / grandTotalKwh) * 100 : 0);
            var tooltipText = equipment.label + ': ' + equipment.value.toFixed(2) + ' kWh (' + equipment.cost.toFixed(2) + ' €)';
            
            html += '<div class="chart-segment" style="height: ' + heightPercent + '% !important; background-color: ' + equipment.color + '; border-color: ' + equipment.borderColor + ';" data-tooltip="' + tooltipText + '"></div>';
        });
        
        html += '</div>';
        html += '<div class="chart-label">' + periodLabel + '</div>';
        html += '</div></div>';
        
        return html;
    }

    // Générer graphique barres groupées total (une barre par équipement pour toute la période)
    function generateGroupedTotalChart(chartData) {
        // Déterminer si on affiche en € ou en kWh
        var toggleBtn = document.getElementById('toggleValueType');
        var checkbox = toggleBtn ? toggleBtn.querySelector('input[type="checkbox"]') : null;
        var showCost = checkbox && checkbox.checked;
        
        var equipmentTotals = [];
        var maxValue = 0;
        var maxCost = 0;
        var grandTotalKwh = 0;
        var grandTotalCost = 0;
        
        chartData.datasets.forEach(function(dataset) {
            var totalKwh = dataset.data.reduce(function(sum, val) { return sum + (val || 0); }, 0);
            if (totalKwh > 0) {
                var equipmentCost = window.equipmentCosts && window.equipmentCosts[dataset.label];
                var cost = equipmentCost ? equipmentCost.total : 0;
                
                equipmentTotals.push({
                    label: dataset.label,
                    value: totalKwh,
                    cost: cost,
                    color: dataset.backgroundColor,
                    borderColor: dataset.borderColor
                });
                
                maxValue = Math.max(maxValue, totalKwh);
                maxCost = Math.max(maxCost, cost);
                grandTotalKwh += totalKwh;
                grandTotalCost += cost;
            }
        });
        
        // Trier par coût en mode €, sinon par kWh
        if (showCost) {
            equipmentTotals.sort(function(a, b) { return b.cost - a.cost; });
        }
        
        var html = '<div class="grouped-bars-container"><div class="grouped-day">';
        html += '<div class="grouped-bars">';
        
        equipmentTotals.forEach(function(equipment) {
            // Calculer la hauteur basée sur le toggle
            var heightPercent = showCost
                ? (maxCost > 0 ? (equipment.cost / maxCost) * 100 : 0)
                : (maxValue > 0 ? (equipment.value / maxValue) * 100 : 0);
            var tooltipText = equipment.label + ': ' + equipment.value.toFixed(2) + ' kWh (' + equipment.cost.toFixed(2) + ' €)';
            
            html += '<div class="grouped-bar" style="height: ' + heightPercent + '%; background-color: ' + equipment.color + ';" data-tooltip="' + tooltipText + '"></div>';
        });
        
        html += '</div>';
        html += '<div class="grouped-label">{{Période totale}}</div>';
        html += '</div></div>';
        
        // Ajouter le label total en haut avec toggle kWh/€
        var periodData = {
            total: grandTotalKwh,
            cost_hc_ttc: 0,
            cost_hp_ttc: 0,
            hc: 0,
            hp: 0,
            periods: {}
        };
        
        // Agréger les données de tous les jours pour le tooltip
        if (window.dailyTotals) {
            Object.keys(window.dailyTotals).forEach(function(dayLabel) {
                var dayData = window.dailyTotals[dayLabel];
                periodData.cost_hc_ttc += parseFloat(dayData.cost_hc_ttc) || 0;
                periodData.cost_hp_ttc += parseFloat(dayData.cost_hp_ttc) || 0;
                periodData.hc += parseFloat(dayData.hc) || 0;
                periodData.hp += parseFloat(dayData.hp) || 0;
                
                if (dayData.periods) {
                    Object.keys(dayData.periods).forEach(function(periodKey) {
                        var period = dayData.periods[periodKey];
                        var color = period.color;
                        if (!periodData.periods[color]) {
                            periodData.periods[color] = { color: color, hc: 0, hp: 0 };
                        }
                        periodData.periods[color].hc += parseFloat(period.hc) || 0;
                        periodData.periods[color].hp += parseFloat(period.hp) || 0;
                    });
                } else if (dayData.day_color) {
                    var color = dayData.day_color;
                    if (!periodData.periods[color]) {
                        periodData.periods[color] = { color: color, hc: 0, hp: 0 };
                    }
                    periodData.periods[color].hc += parseFloat(dayData.hc) || 0;
                    periodData.periods[color].hp += parseFloat(dayData.hp) || 0;
                }
            });
        }
        
        var totalTooltip = generateDetailedTooltip('{{Total période}}', grandTotalKwh, grandTotalCost, periodData);
        
        var periodLabel = aggregationMode === 'monthly' ? '{{Total mois}}' : (aggregationMode === 'yearly' ? '{{Total années}}' : '{{Total période}}');
        
        var totalLabel = '<div class="grouped-total-label-container">' +
                        '<div class="grouped-kwh" data-tooltip="' + totalTooltip + '">' + grandTotalKwh.toFixed(2) + ' kWh</div>' +
                        '<div class="grouped-cost" data-tooltip="' + totalTooltip + '" style="display: none;">' + grandTotalCost.toFixed(2) + ' €</div>' +
                        '<div style="font-size: 0.9em; color: #999; margin-top: 4px;">' + periodLabel + '</div>' +
                        '</div>';
        
        return '<div class="chart-with-top-label">' + totalLabel + html + '</div>';
    }

    // Générer graphique lignes
    function generateLineChart(chartData) {
        var minValue = Infinity;
        var maxValue = 0;
        var grandTotalKwh = 0;
        var grandTotalCost = 0;
        var tariffType = window.tariffType || 'base';

        chartData.datasets.forEach(function(dataset) {
            var totalKwh = dataset.data.reduce(function(sum, val) { return sum + (val || 0); }, 0);
            grandTotalKwh += totalKwh;
            var equipmentCost = window.equipmentCosts && window.equipmentCosts[dataset.label];
            if (equipmentCost) {
                grandTotalCost += equipmentCost.total;
            }
            
            dataset.data.forEach(function(value) {
                if (value > 0) {
                    minValue = Math.min(minValue, value);
                    maxValue = Math.max(maxValue, value);
                }
            });
        });

        var range = maxValue - minValue || 1;
        var numDays = chartData.labels.length;
        var viewBoxWidth = 100 + numDays * 120;
        var viewBoxHeight = 450;

        // Créer le label du total en haut avec tooltip détaillé
        var periodData = {
            total: grandTotalKwh,
            cost_hc_ttc: 0,
            cost_hp_ttc: 0,
            hc: 0,
            hp: 0,
            periods: {}
        };
        
        // Agréger les données de tous les jours
        if (window.dailyTotals) {
            Object.keys(window.dailyTotals).forEach(function(dayLabel) {
                var dayData = window.dailyTotals[dayLabel];
                periodData.cost_hc_ttc += parseFloat(dayData.cost_hc_ttc) || 0;
                periodData.cost_hp_ttc += parseFloat(dayData.cost_hp_ttc) || 0;
                periodData.hc += parseFloat(dayData.hc) || 0;
                periodData.hp += parseFloat(dayData.hp) || 0;
                
                if (dayData.periods) {
                    Object.keys(dayData.periods).forEach(function(periodKey) {
                        var period = dayData.periods[periodKey];
                        var color = period.color;
                        if (!periodData.periods[color]) {
                            periodData.periods[color] = { color: color, hc: 0, hp: 0 };
                        }
                        periodData.periods[color].hc += parseFloat(period.hc) || 0;
                        periodData.periods[color].hp += parseFloat(period.hp) || 0;
                    });
                } else if (dayData.day_color) {
                    var color = dayData.day_color;
                    if (!periodData.periods[color]) {
                        periodData.periods[color] = { color: color, hc: 0, hp: 0 };
                    }
                    periodData.periods[color].hc += parseFloat(dayData.hc) || 0;
                    periodData.periods[color].hp += parseFloat(dayData.hp) || 0;
                }
            });
        }
        
        var totalTooltip = generateDetailedTooltip('{{Total période}}', grandTotalKwh, grandTotalCost, periodData);
        
        // Déterminer si on affiche en € ou en kWh
        var toggleBtn = document.getElementById('toggleValueType');
        var checkbox = toggleBtn ? toggleBtn.querySelector('input[type="checkbox"]') : null;
        var showCost = checkbox && checkbox.checked;
        
        var totalLabelKwh = '<div class="chart-period-total-kwh" data-tooltip="' + totalTooltip + '" style="' + (showCost ? 'display: none;' : '') + '">' + grandTotalKwh.toFixed(2) + ' kWh</div>';
        var totalLabelCost = '<div class="chart-period-total-cost" data-tooltip="' + totalTooltip + '" style="' + (showCost ? '' : 'display: none;') + '">' + grandTotalCost.toFixed(2) + ' €</div>';
        var totalLabel = totalLabelKwh + totalLabelCost;

        var svgContent = '<g class="grid">';
        for (var i = 0; i <= 5; i++) {
            var y = 50 + (i * (viewBoxHeight - 100) / 5);
            svgContent += '<line x1="50" y1="' + y + '" x2="' + (viewBoxWidth - 50) + '" y2="' + y + '" stroke="#e0e0e0" stroke-width="1"/>';
        }
        svgContent += '</g>';

        chartData.datasets.forEach(function(dataset, datasetIndex) {
            var points = '';
            var pointData = [];

            dataset.data.forEach(function(value, dayIndex) {
                if (value > 0) {
                    var x = 50 + dayIndex * 120;
                    var y = 50 + (viewBoxHeight - 100) * (1 - ((value - minValue) / range));
                    points += (points ? ' ' : '') + x + ',' + y;
                    pointData.push({x: x, y: y, value: value, day: chartData.labels[dayIndex], dayIndex: dayIndex});
                }
            });

            if (points) {
                // Construire le tooltip détaillé pour cet équipement
                var totalKwh = dataset.data.reduce(function(sum, val) { return sum + (val || 0); }, 0);
                var equipmentCost = window.equipmentCosts && window.equipmentCosts[dataset.label];
                var cost = equipmentCost ? equipmentCost.total : 0;
                
                var tooltipLines = ['<strong>' + dataset.label + '</strong>'];
                tooltipLines.push('{{Total}} : ' + totalKwh.toFixed(2) + ' kWh (' + cost.toFixed(2) + ' € TTC)');
                tooltipLines.push('------------------');
                
                // Ajouter les détails HC/HP/Tempo si disponibles
                var equipmentHCHP = window.equipmentDailyHCHP && window.equipmentDailyHCHP[dataset.label];
                if (equipmentHCHP && tariffType !== 'base') {
                    var totalHC = 0, totalHP = 0;
                    var colorBreakdown = {};
                    
                    Object.keys(equipmentHCHP).forEach(function(dayIndex) {
                        var dayData = equipmentHCHP[dayIndex];
                        totalHC += dayData.hc || 0;
                        totalHP += dayData.hp || 0;
                        
                        if (tariffType === 'tempo' && dayData.day_color) {
                            var color = dayData.day_color;
                            if (!colorBreakdown[color]) {
                                colorBreakdown[color] = { hc: 0, hp: 0 };
                            }
                            colorBreakdown[color].hc += dayData.hc || 0;
                            colorBreakdown[color].hp += dayData.hp || 0;
                        }
                    });
                    
                    if (tariffType === 'tempo' && Object.keys(colorBreakdown).length > 0) {
                        var colors = ['bleu', 'blanc', 'rouge'];
                        colors.forEach(function(color) {
                            if (colorBreakdown[color]) {
                                var colorData = colorBreakdown[color];
                                var colorEmoji = color === 'bleu' ? '🔵' : (color === 'blanc' ? '⚪' : '🔴');
                                if (colorData.hc > 0) {
                                    var hcPercent = totalKwh > 0 ? ((colorData.hc / totalKwh) * 100).toFixed(1) : 0;
                                    tooltipLines.push('HC ' + colorEmoji + ' ' + colorData.hc.toFixed(2) + ' kWh (' + hcPercent + '%)');
                                }
                                if (colorData.hp > 0) {
                                    var hpPercent = totalKwh > 0 ? ((colorData.hp / totalKwh) * 100).toFixed(1) : 0;
                                    tooltipLines.push('HP ' + colorEmoji + ' ' + colorData.hp.toFixed(2) + ' kWh (' + hpPercent + '%)');
                                }
                            }
                        });
                    } else {
                        if (totalHC > 0) {
                            var hcPercent = totalKwh > 0 ? ((totalHC / totalKwh) * 100).toFixed(1) : 0;
                            tooltipLines.push('HC: ' + totalHC.toFixed(2) + ' kWh (' + hcPercent + '%)');
                        }
                        if (totalHP > 0) {
                            var hpPercent = totalKwh > 0 ? ((totalHP / totalKwh) * 100).toFixed(1) : 0;
                            tooltipLines.push('HP: ' + totalHP.toFixed(2) + ' kWh (' + hpPercent + '%)');
                        }
                    }
                }
                
                var tooltipText = tooltipLines.join('<br>');
                svgContent += '<polyline points="' + points + '" fill="none" stroke="' + dataset.borderColor + '" stroke-width="3" class="line-path" data-tooltip="' + tooltipText + '"></polyline>';

                pointData.forEach(function(point) {
                    var valueKwh = point.value;
                    var equipmentCost = window.equipmentCosts && window.equipmentCosts[dataset.label];
                    var totalEquipmentValue = dataset.data.reduce(function(sum, val) { return sum + (val || 0); }, 0);
                    var cost = equipmentCost && totalEquipmentValue > 0 ? ((point.value / totalEquipmentValue) * equipmentCost.total).toFixed(2) : '0.00';
                    var tooltipText = dataset.label + ' (' + point.day + '): ' + Math.round(point.value * 100) / 100 + ' kWh (' + cost + ' €)';
                    svgContent += '<circle cx="' + point.x + '" cy="' + point.y + '" r="5" fill="' + dataset.borderColor + '" class="line-point" data-tooltip="' + tooltipText + '"></circle>';
                });
            }
        });

        chartData.labels.forEach(function(label, dayIndex) {
            var x = 50 + dayIndex * 120;
            var y = 50 + viewBoxHeight - 50;
            
            var periodLabel = getPeriodDescription(label, aggregationMode);
            
            // Calculer le coût total du jour
            var dayCost = 0;
            chartData.datasets.forEach(function(dataset) {
                var value = dataset.data[dayIndex] || 0;
                var equipmentCost = window.equipmentCosts && window.equipmentCosts[dataset.label];
                if (equipmentCost) {
                    var totalEquipmentValue = dataset.data.reduce(function(sum, val) { return sum + (val || 0); }, 0);
                    if (totalEquipmentValue > 0) {
                        dayCost += (value / totalEquipmentValue) * equipmentCost.total;
                    }
                }
            });
            
            // Ajouter l'abonnement (ajusté selon la période)
            var subscriptionCost = parseFloat(window.subscriptionDailyCost) || 0;
            if (aggregationMode === 'monthly') {
                subscriptionCost *= 30;
            } else if (aggregationMode === 'yearly') {
                subscriptionCost *= 365;
            }
            dayCost += subscriptionCost;
            
            var dayCostFormatted = dayCost.toFixed(2) + ' €';
            
            svgContent += '<text x="' + x + '" y="' + y + '" text-anchor="middle" font-size="12">' + periodLabel + '</text>';
            svgContent += '<text x="' + x + '" y="' + (y + 15) + '" text-anchor="middle" font-size="10" fill="##28a745" font-weight="bold">' + dayCostFormatted + '</text>';
        });

        return '<div style="position: relative;">' + totalLabel + '<div class="line-chart-container"><svg viewBox="0 0 ' + viewBoxWidth + ' ' + viewBoxHeight + '" class="line-chart" preserveAspectRatio="xMidYMid meet">' + svgContent + '</svg></div></div>';
    }

    // Générer graphique aires empilées
    function generateAreaChart(chartData) {
        var minValue = Infinity;
        var maxValue = 0;
        var grandTotalKwh = 0;
        var grandTotalCost = 0;
        var tariffType = window.tariffType || 'base';

        chartData.datasets.forEach(function(dataset) {
            var totalKwh = dataset.data.reduce(function(sum, val) { return sum + (val || 0); }, 0);
            grandTotalKwh += totalKwh;
            var equipmentCost = window.equipmentCosts && window.equipmentCosts[dataset.label];
            if (equipmentCost) {
                grandTotalCost += equipmentCost.total;
            }
            
            dataset.data.forEach(function(value) {
                if (value > 0) {
                    minValue = Math.min(minValue, value);
                    maxValue = Math.max(maxValue, value);
                }
            });
        });

        var range = maxValue - minValue || 1;
        var numDays = chartData.labels.length;
        var viewBoxWidth = 100 + numDays * 120;
        var viewBoxHeight = 450;

        // Créer le label du total en haut avec tooltip détaillé
        var periodData = {
            total: grandTotalKwh,
            cost_hc_ttc: 0,
            cost_hp_ttc: 0,
            hc: 0,
            hp: 0,
            periods: {}
        };
        
        // Agréger les données de tous les jours
        if (window.dailyTotals) {
            Object.keys(window.dailyTotals).forEach(function(dayLabel) {
                var dayData = window.dailyTotals[dayLabel];
                periodData.cost_hc_ttc += parseFloat(dayData.cost_hc_ttc) || 0;
                periodData.cost_hp_ttc += parseFloat(dayData.cost_hp_ttc) || 0;
                periodData.hc += parseFloat(dayData.hc) || 0;
                periodData.hp += parseFloat(dayData.hp) || 0;
                
                if (dayData.periods) {
                    Object.keys(dayData.periods).forEach(function(periodKey) {
                        var period = dayData.periods[periodKey];
                        var color = period.color;
                        if (!periodData.periods[color]) {
                            periodData.periods[color] = { color: color, hc: 0, hp: 0 };
                        }
                        periodData.periods[color].hc += parseFloat(period.hc) || 0;
                        periodData.periods[color].hp += parseFloat(period.hp) || 0;
                    });
                } else if (dayData.day_color) {
                    var color = dayData.day_color;
                    if (!periodData.periods[color]) {
                        periodData.periods[color] = { color: color, hc: 0, hp: 0 };
                    }
                    periodData.periods[color].hc += parseFloat(dayData.hc) || 0;
                    periodData.periods[color].hp += parseFloat(dayData.hp) || 0;
                }
            });
        }
        
        var totalTooltip = generateDetailedTooltip('{{Total période}}', grandTotalKwh, grandTotalCost, periodData);
        
        // Déterminer si on affiche en € ou en kWh
        var toggleBtn = document.getElementById('toggleValueType');
        var checkbox = toggleBtn ? toggleBtn.querySelector('input[type="checkbox"]') : null;
        var showCost = checkbox && checkbox.checked;
        
        var totalLabelKwh = '<div class="chart-period-total-kwh" data-tooltip="' + totalTooltip + '" style="' + (showCost ? 'display: none;' : '') + '">' + grandTotalKwh.toFixed(2) + ' kWh</div>';
        var totalLabelCost = '<div class="chart-period-total-cost" data-tooltip="' + totalTooltip + '" style="' + (showCost ? '' : 'display: none;') + '">' + grandTotalCost.toFixed(2) + ' €</div>';
        var totalLabel = totalLabelKwh + totalLabelCost;

        var svgContent = '<g class="grid">';
        for (var i = 0; i <= 5; i++) {
            var y = 50 + (i * (viewBoxHeight - 100) / 5);
            svgContent += '<line x1="50" y1="' + y + '" x2="' + (viewBoxWidth - 50) + '" y2="' + y + '" stroke="#e0e0e0" stroke-width="1"/>';
        }
        svgContent += '</g>';

        var previousPoints = '';
        chartData.datasets.forEach(function(dataset, datasetIndex) {
            var points = '';
            var areaPoints = '';

            dataset.data.forEach(function(value, dayIndex) {
                var x = 50 + dayIndex * 120;
                var y = 50 + (viewBoxHeight - 100) * (1 - ((value - minValue) / range));
                points += (points ? ' ' : '') + x + ',' + y;
            });

            if (points) {
                // Créer le chemin de l'aire
                var pointArray = points.split(' ');
                var areaPath = 'M ' + pointArray[0];
                for (var i = 1; i < pointArray.length; i++) {
                    areaPath += ' L ' + pointArray[i];
                }
                // Fermer l'aire vers le bas
                areaPath += ' L ' + (50 + (pointArray.length - 1) * 120) + ',' + (50 + viewBoxHeight - 100) + ' L ' + pointArray[0].split(',')[0] + ',' + (50 + viewBoxHeight - 100) + ' Z';

                var totalKwh = dataset.data.reduce(function(sum, val) { return sum + (val || 0); }, 0);
                var equipmentCost = window.equipmentCosts && window.equipmentCosts[dataset.label];
                var cost = equipmentCost ? equipmentCost.total : 0;
                
                var tooltipLines = ['<strong>' + dataset.label + '</strong>'];
                tooltipLines.push('{{Total}} : ' + totalKwh.toFixed(2) + ' kWh (' + cost.toFixed(2) + ' € TTC)');
                tooltipLines.push('------------------');
                
                // Ajouter les détails HC/HP/Tempo si disponibles
                var equipmentHCHP = window.equipmentDailyHCHP && window.equipmentDailyHCHP[dataset.label];
                if (equipmentHCHP && tariffType !== 'base') {
                    var totalHC = 0, totalHP = 0;
                    var colorBreakdown = {};
                    
                    Object.keys(equipmentHCHP).forEach(function(dayIndex) {
                        var dayData = equipmentHCHP[dayIndex];
                        totalHC += dayData.hc || 0;
                        totalHP += dayData.hp || 0;
                        
                        if (tariffType === 'tempo' && dayData.day_color) {
                            var color = dayData.day_color;
                            if (!colorBreakdown[color]) {
                                colorBreakdown[color] = { hc: 0, hp: 0 };
                            }
                            colorBreakdown[color].hc += dayData.hc || 0;
                            colorBreakdown[color].hp += dayData.hp || 0;
                        }
                    });
                    
                    if (tariffType === 'tempo' && Object.keys(colorBreakdown).length > 0) {
                        var colors = ['bleu', 'blanc', 'rouge'];
                        colors.forEach(function(color) {
                            if (colorBreakdown[color]) {
                                var colorData = colorBreakdown[color];
                                var colorEmoji = color === 'bleu' ? '🔵' : (color === 'blanc' ? '⚪' : '🔴');
                                if (colorData.hc > 0) {
                                    var hcPercent = totalKwh > 0 ? ((colorData.hc / totalKwh) * 100).toFixed(1) : 0;
                                    tooltipLines.push('HC ' + colorEmoji + ' ' + colorData.hc.toFixed(2) + ' kWh (' + hcPercent + '%)');
                                }
                                if (colorData.hp > 0) {
                                    var hpPercent = totalKwh > 0 ? ((colorData.hp / totalKwh) * 100).toFixed(1) : 0;
                                    tooltipLines.push('HP ' + colorEmoji + ' ' + colorData.hp.toFixed(2) + ' kWh (' + hpPercent + '%)');
                                }
                            }
                        });
                    } else {
                        if (totalHC > 0) {
                            var hcPercent = totalKwh > 0 ? ((totalHC / totalKwh) * 100).toFixed(1) : 0;
                            tooltipLines.push('HC: ' + totalHC.toFixed(2) + ' kWh (' + hcPercent + '%)');
                        }
                        if (totalHP > 0) {
                            var hpPercent = totalKwh > 0 ? ((totalHP / totalKwh) * 100).toFixed(1) : 0;
                            tooltipLines.push('HP: ' + totalHP.toFixed(2) + ' kWh (' + hpPercent + '%)');
                        }
                    }
                }
                
                var tooltipText = tooltipLines.join('<br>');

                svgContent += '<path d="' + areaPath + '" fill="' + dataset.backgroundColor + '" fill-opacity="0.7" stroke="' + dataset.borderColor + '" stroke-width="2" class="area-path" data-tooltip="' + tooltipText + '"></path>';
            }
        });

        chartData.labels.forEach(function(label, dayIndex) {
            var x = 50 + dayIndex * 120;
            var y = 50 + viewBoxHeight - 50;
            
            var periodLabel = getPeriodDescription(label, aggregationMode);
            
            // Calculer le coût total du jour
            var dayCost = 0;
            chartData.datasets.forEach(function(dataset) {
                var value = dataset.data[dayIndex] || 0;
                var equipmentCost = window.equipmentCosts && window.equipmentCosts[dataset.label];
                if (equipmentCost) {
                    var totalEquipmentValue = dataset.data.reduce(function(sum, val) { return sum + (val || 0); }, 0);
                    if (totalEquipmentValue > 0) {
                        dayCost += (value / totalEquipmentValue) * equipmentCost.total;
                    }
                }
            });
            
            // Ajouter l'abonnement (ajusté selon la période)
            var subscriptionCost = parseFloat(window.subscriptionDailyCost) || 0;
            if (aggregationMode === 'monthly') {
                subscriptionCost *= 30;
            } else if (aggregationMode === 'yearly') {
                subscriptionCost *= 365;
            }
            dayCost += subscriptionCost;
            
            var dayCostFormatted = dayCost.toFixed(2) + ' €';
            
            svgContent += '<text x="' + x + '" y="' + y + '" text-anchor="middle" font-size="12">' + periodLabel + '</text>';
            svgContent += '<text x="' + x + '" y="' + (y + 15) + '" text-anchor="middle" font-size="10" fill="#28a745" font-weight="bold">' + dayCostFormatted + '</text>';
        });

        return '<div style="position: relative;">' + totalLabel + '<div class="area-chart-container"><svg viewBox="0 0 ' + viewBoxWidth + ' ' + viewBoxHeight + '" class="area-chart" preserveAspectRatio="xMidYMid meet">' + svgContent + '</svg></div></div>';
    }

    // Générer graphique radar
    function generateRadarChart(chartData) {
        var equipmentTotals = [];
        var grandTotal = 0;

        chartData.datasets.forEach(function(dataset, index) {
            var total = dataset.data.reduce(function(sum, val) { return sum + (val || 0); }, 0);
            if (total > 0) {
                equipmentTotals.push({
                    label: dataset.label,
                    total: total,
                    color: dataset.backgroundColor,
                    borderColor: dataset.borderColor,
                    data: dataset.data
                });
                grandTotal += total;
            }
        });

        if (equipmentTotals.length === 0) {
            return '<div class="no-data"><i class="fas fa-chart-line"></i><p>{{Aucune donnée disponible}}</p></div>';
        }

        var numPoints = chartData.labels.length;
        var centerX = 200;
        var centerY = 200;
        var maxRadius = 150;

        var svgContent = '';

        // Grille radar
        for (var level = 1; level <= 5; level++) {
            var radius = (maxRadius / 5) * level;
            var points = '';
            for (var i = 0; i < numPoints; i++) {
                var angle = (i * 360 / numPoints) - 90;
                var x = centerX + radius * Math.cos(angle * Math.PI / 180);
                var y = centerY + radius * Math.sin(angle * Math.PI / 180);
                points += (points ? ' ' : '') + x + ',' + y;
            }
            svgContent += '<polygon points="' + points + '" fill="none" stroke="#e0e0e0" stroke-width="1"/>';
        }

        // Lignes radiales
        for (var radialIndex = 0; radialIndex < numPoints; radialIndex++) {
            var radialAngle = (radialIndex * 360 / numPoints) - 90;
            var radialX = centerX + maxRadius * Math.cos(radialAngle * Math.PI / 180);
            var radialY = centerY + maxRadius * Math.sin(radialAngle * Math.PI / 180);
            svgContent += '<line x1="' + centerX + '" y1="' + centerY + '" x2="' + radialX + '" y2="' + radialY + '" stroke="#e0e0e0" stroke-width="1"/>';
        }

        // Données radar pour chaque équipement
        equipmentTotals.forEach(function(equipment) {
            var points = '';
            var maxEquipmentValue = Math.max.apply(null, equipment.data);

            equipment.data.forEach(function(value, index) {
                var angle = (index * 360 / numPoints) - 90;
                var radius = maxEquipmentValue > 0 ? (value / maxEquipmentValue) * maxRadius : 0;
                var x = centerX + radius * Math.cos(angle * Math.PI / 180);
                var y = centerY + radius * Math.sin(angle * Math.PI / 180);
                points += (points ? ' ' : '') + x + ',' + y;
            });

            if (points) {
                var valueFormatted = Math.round(equipment.total * 100) / 100 + ' kWh';
                var valueKwh = equipment.total;
                var equipmentCost = window.equipmentCosts && window.equipmentCosts[equipment.label];
                var cost = equipmentCost ? equipmentCost.total.toFixed(2) : '0.00';
                var tooltipText = equipment.label + ': ' + valueFormatted + ' (' + cost + ' €)';
                svgContent += '<polygon points="' + points + '" fill="' + equipment.color + '" fill-opacity="0.3" stroke="' + equipment.borderColor + '" stroke-width="2" class="radar-area" data-tooltip="' + tooltipText + '"></polygon>';
            }
        });

        // Labels des axes
        chartData.labels.forEach(function(label, index) {
            var angle = (index * 360 / numPoints) - 90;
            var x = centerX + (maxRadius + 20) * Math.cos(angle * Math.PI / 180);
            var y = centerY + (maxRadius + 20) * Math.sin(angle * Math.PI / 180);
            svgContent += '<text x="' + x + '" y="' + y + '" text-anchor="middle" font-size="12">' + label + '</text>';
        });

        return '<div class="radar-chart-container"><svg viewBox="0 0 400 400" class="radar-chart">' + svgContent + '</svg></div>';
    }

    // Générer carte thermique
    function generateHeatmapChart(chartData) {
        var maxValue = 0;
        chartData.datasets.forEach(function(dataset) {
            maxValue = Math.max(maxValue, Math.max.apply(null, dataset.data));
        });

        var html = '<div class="heatmap-container">';
        html += '<div class="heatmap-grid">';

        // En-tête avec les dates
        html += '<div class="heatmap-header">';
        html += '<div class="heatmap-corner"></div>';
        chartData.labels.forEach(function(label) {
            var periodLabel = getPeriodDescription(label, aggregationMode);
            html += '<div class="heatmap-header-cell">' + periodLabel + '</div>';
        });
        html += '</div>';

        // Lignes pour chaque équipement
        chartData.datasets.forEach(function(dataset, datasetIndex) {
            html += '<div class="heatmap-row">';
            html += '<div class="heatmap-row-label">' + dataset.label + '</div>';

            dataset.data.forEach(function(value, dayIndex) {
                var intensity = maxValue > 0 ? (value / maxValue) : 0;
                var color = getHeatmapColor(intensity);
                var valueKwh = value / 1000;
                var equipmentCost = window.equipmentCosts && window.equipmentCosts[dataset.label];
                var totalEquipmentValue = dataset.data.reduce(function(sum, val) { return sum + (val || 0); }, 0);
                var cost = equipmentCost && totalEquipmentValue > 0 ? ((value / totalEquipmentValue) * equipmentCost.total).toFixed(2) : '0.00';
                var tooltipText = dataset.label + ' (' + chartData.labels[dayIndex] + '): ' + Math.round(value * 100) / 100 + ' Wh (' + cost + ' €)';
                html += '<div class="heatmap-cell" style="background-color: ' + color + ';" data-tooltip="' + tooltipText + '"></div>';
            });

            html += '</div>';
        });

        html += '</div>';

        // Légende
        html += '<div class="heatmap-legend">';
        html += '<div class="legend-title">{{Intensité}}</div>';
        html += '<div class="legend-scale">';
        for (var i = 0; i <= 10; i++) {
            var intensity = i / 10;
            var color = getHeatmapColor(intensity);
            html += '<div class="legend-step" style="background-color: ' + color + ';"></div>';
        }
        html += '</div>';
        html += '<div class="legend-labels"><span>{{Faible}}</span><span>{{Élevé}}</span></div>';
        html += '</div>';

        html += '</div>';
        return html;
    }

    // Fonction utilitaire pour les couleurs de la heatmap
    function getHeatmapColor(intensity) {
        // Dégradé du bleu au rouge
        var r = Math.round(255 * intensity);
        var g = Math.round(100 * (1 - intensity));
        var b = Math.round(255 * (1 - intensity));
        return 'rgb(' + r + ',' + g + ',' + b + ')';
    }

    // Fonction de highlight pour la synchronisation chart/liste
    function highlightEquipment(equipmentLabel, source) {
        if (!equipmentLabel) {
            // Réinitialiser tous les éléments
            document.querySelectorAll('.chart-segment, .grouped-bar, .pie-slice, .line-path, .line-point, .area-path, .radar-area, .heatmap-cell').forEach(function(el) {
                el.classList.remove('dimmed', 'highlighted');
            });
            document.querySelectorAll('.equipment-card').forEach(function(card) {
                card.classList.remove('dimmed-chart', 'dimmed-list', 'highlighted');
            });
            return;
        }

        // Normalisation du label pour comparaison robuste
        var norm = function(str) {
            return (str || '').toLowerCase().replace(/\s+/g, '').trim();
        };
        var normLabel = norm(equipmentLabel);

        // Mettre en surbrillance l'équipement sélectionné dans la liste
        document.querySelectorAll('.equipment-card').forEach(function(card) {
            var cardLabel = norm(card.querySelector('.equipment-name').textContent);
            if (cardLabel === normLabel) {
                card.classList.add('highlighted');
                card.classList.remove('dimmed-chart', 'dimmed-list');
            } else {
                if (source === 'chart') {
                    card.classList.add('dimmed-chart');
                    card.classList.remove('highlighted', 'dimmed-list');
                } else if (source === 'list') {
                    card.classList.add('dimmed-list');
                    card.classList.remove('highlighted', 'dimmed-chart');
                }
            }
        });

        // Mettre en surbrillance les éléments du graphique
        document.querySelectorAll('.chart-segment, .grouped-bar, .pie-slice, .line-path, .line-point, .area-path, .radar-area, .heatmap-cell').forEach(function(el) {
            var tooltip = el.getAttribute('data-tooltip') || '';
            var dataLabel = el.getAttribute('data-label') || '';
            var elementLabel = '';

            if (el.classList.contains('chart-segment') || el.classList.contains('grouped-bar') || el.classList.contains('line-point') || el.classList.contains('heatmap-cell')) {
                // Extraire le label depuis le tooltip (format: "Label: valeur")
                var match = tooltip.match(/<strong>([^<]+)<\/strong>/);
                elementLabel = match ? norm(match[1]) : norm(tooltip.split(':')[0]);
            } else if (el.classList.contains('pie-slice')) {
                elementLabel = norm(dataLabel);
            } else if (el.classList.contains('line-path') || el.classList.contains('area-path') || el.classList.contains('radar-area')) {
                elementLabel = norm(tooltip.split(':')[0]);
            }

            if (elementLabel === normLabel) {
                el.classList.add('highlighted');
                el.classList.remove('dimmed');
            } else {
                el.classList.add('dimmed');
                el.classList.remove('highlighted');
            }
        });
    }

    // Attacher les événements aux éléments du graphique
    function attachChartEvents() {
        // Ré-attacher tous les événements existants
        attachTooltipEvents();
        attachHighlightEvents();
    }

    // Attacher les événements de tooltip
    function attachTooltipEvents() {
        // Gestion des tooltips et highlight sur les segments
        document.querySelectorAll('.chart-segment').forEach(function(segment) {
            segment.addEventListener('mouseenter', function(e) {
                var text = this.getAttribute('data-tooltip');
                if (text) {
                    tooltip.innerHTML = text;
                    tooltip.style.display = 'block';
                    // Extraire le nom de l'entrée (entre <strong> et </strong>)
                    var match = text.match(/<strong>(.*?)<\/strong>/);
                    var equipmentLabel = match ? match[1] : text.split(':')[0];
                    highlightEquipment(equipmentLabel, 'chart');
                }
            });

            segment.addEventListener('mousemove', function(e) {
                tooltip.style.left = (e.clientX + 15) + 'px';
                tooltip.style.top = (e.clientY + 15) + 'px';
            });

            segment.addEventListener('mouseleave', function() {
                tooltip.style.display = 'none';
                highlightEquipment(null);
                document.querySelectorAll('.equipment-card').forEach(function(card) {
                    card.classList.remove('dimmed-chart', 'dimmed-list', 'highlighted');
                });
            });
        });

        // Gestion des barres groupées
        document.querySelectorAll('.grouped-bar').forEach(function(bar) {
            bar.addEventListener('mouseenter', function(e) {
                var text = this.getAttribute('data-tooltip');
                if (text) {
                    tooltip.innerHTML = text;
                    tooltip.style.display = 'block';
                    var equipmentLabel = text.split(':')[0];
                    highlightEquipment(equipmentLabel, 'chart');
                }
            });

            bar.addEventListener('mousemove', function(e) {
                tooltip.style.left = (e.clientX + 15) + 'px';
                tooltip.style.top = (e.clientY + 15) + 'px';
            });

            bar.addEventListener('mouseleave', function() {
                tooltip.style.display = 'none';
                highlightEquipment(null);
                document.querySelectorAll('.equipment-card').forEach(function(card) {
                    card.classList.remove('dimmed-chart', 'dimmed-list', 'highlighted');
                });
            });
        });

        // Gestion des tooltips pour chart-bar-value et chart-bar-cost
        document.querySelectorAll('.chart-bar-value, .chart-bar-cost').forEach(function(element) {
            element.addEventListener('mouseenter', function(e) {
                var text = this.getAttribute('data-tooltip');
                if (text) {
                    tooltip.innerHTML = text;
                    tooltip.style.display = 'block';
                }
            });

            element.addEventListener('mousemove', function(e) {
                tooltip.style.left = (e.clientX + 15) + 'px';
                tooltip.style.top = (e.clientY + 15) + 'px';
            });

            element.addEventListener('mouseleave', function() {
                tooltip.style.display = 'none';
            });
        });

        // Gestion des tooltips pour les totaux (chart-bar-total, pie-center, daily-pie, grouped, chart-period-total)
        document.querySelectorAll('.chart-bar-total, .pie-center-kwh, .pie-center-cost, .daily-pie-kwh, .daily-pie-cost, .grouped-kwh, .grouped-cost, .chart-period-total, .chart-period-total-kwh, .chart-period-total-cost').forEach(function(element) {
            element.addEventListener('mouseenter', function(e) {
                var text = this.getAttribute('data-tooltip');
                if (text) {
                    tooltip.innerHTML = text;
                    tooltip.style.display = 'block';
                }
            });

            element.addEventListener('mousemove', function(e) {
                tooltip.style.left = (e.clientX + 15) + 'px';
                tooltip.style.top = (e.clientY + 15) + 'px';
            });

            element.addEventListener('mouseleave', function() {
                tooltip.style.display = 'none';
            });
        });

        // Gestion du camembert - tranches
        document.querySelectorAll('.pie-slice').forEach(function(slice) {
            slice.addEventListener('mouseenter', function(e) {
                var text = this.getAttribute('data-tooltip');
                var equipmentLabel = this.getAttribute('data-label');
                if (text) {
                    tooltip.innerHTML = text;
                    tooltip.style.display = 'block';
                    highlightEquipment(equipmentLabel, 'chart');
                }
            });

            slice.addEventListener('mousemove', function(e) {
                tooltip.style.left = (e.clientX + 15) + 'px';
                tooltip.style.top = (e.clientY + 15) + 'px';
            });

            slice.addEventListener('mouseleave', function() {
                tooltip.style.display = 'none';
                highlightEquipment(null);
                document.querySelectorAll('.equipment-card').forEach(function(card) {
                    card.classList.remove('dimmed-chart', 'dimmed-list', 'highlighted');
                });
            });
        });

        // Gestion des lignes
        document.querySelectorAll('.line-point').forEach(function(point) {
            point.addEventListener('mouseenter', function(e) {
                var text = this.getAttribute('data-tooltip');
                if (text) {
                    tooltip.innerHTML = text;
                    tooltip.style.display = 'block';
                    var equipmentLabel = text.split(' (')[0];
                    highlightEquipment(equipmentLabel, 'chart');
                }
            });

            point.addEventListener('mousemove', function(e) {
                tooltip.style.left = (e.clientX + 15) + 'px';
                tooltip.style.top = (e.clientY + 15) + 'px';
            });

            point.addEventListener('mouseleave', function() {
                tooltip.style.display = 'none';
                highlightEquipment(null);
                document.querySelectorAll('.equipment-card').forEach(function(card) {
                    card.classList.remove('dimmed-chart', 'dimmed-list', 'highlighted');
                });
            });
        });

        // Gestion des lignes (chemins)
        document.querySelectorAll('.line-path').forEach(function(path) {
            path.addEventListener('mouseenter', function(e) {
                var text = this.getAttribute('data-tooltip');
                if (text) {
                    tooltip.innerHTML = text;
                    tooltip.style.display = 'block';
                    var equipmentLabel = text;
                    highlightEquipment(equipmentLabel, 'chart');
                }
            });

            path.addEventListener('mousemove', function(e) {
                tooltip.style.left = (e.clientX + 15) + 'px';
                tooltip.style.top = (e.clientY + 15) + 'px';
            });

            path.addEventListener('mouseleave', function() {
                tooltip.style.display = 'none';
                highlightEquipment(null);
                document.querySelectorAll('.equipment-card').forEach(function(card) {
                    card.classList.remove('dimmed-chart', 'dimmed-list', 'highlighted');
                });
            });
        });

        // Gestion des aires empilées
        document.querySelectorAll('.area-path').forEach(function(path) {
            path.addEventListener('mouseenter', function(e) {
                var text = this.getAttribute('data-tooltip');
                if (text) {
                    tooltip.innerHTML = text;
                    tooltip.style.display = 'block';
                    var equipmentLabel = text;
                    highlightEquipment(equipmentLabel, 'chart');
                }
            });

            path.addEventListener('mousemove', function(e) {
                tooltip.style.left = (e.clientX + 15) + 'px';
                tooltip.style.top = (e.clientY + 15) + 'px';
            });

            path.addEventListener('mouseleave', function() {
                tooltip.style.display = 'none';
                highlightEquipment(null);
                document.querySelectorAll('.equipment-card').forEach(function(card) {
                    card.classList.remove('dimmed-chart', 'dimmed-list', 'highlighted');
                });
            });
        });

        // Gestion des segments d'aires empilées journaliers
        document.querySelectorAll('.area-segment').forEach(function(segment) {
            segment.addEventListener('mouseenter', function(e) {
                var text = this.getAttribute('data-tooltip');
                if (text) {
                    tooltip.innerHTML = text;
                    tooltip.style.display = 'block';
                    var equipmentLabel = text.split(':')[0];
                    highlightEquipment(equipmentLabel, 'chart');
                }
            });

            segment.addEventListener('mousemove', function(e) {
                tooltip.style.left = (e.clientX + 15) + 'px';
                tooltip.style.top = (e.clientY + 15) + 'px';
            });

            segment.addEventListener('mouseleave', function() {
                tooltip.style.display = 'none';
                highlightEquipment(null);
                document.querySelectorAll('.equipment-card').forEach(function(card) {
                    card.classList.remove('dimmed-chart', 'dimmed-list', 'highlighted');
                });
            });
        });

        // Gestion du radar
        document.querySelectorAll('.radar-area').forEach(function(area) {
            area.addEventListener('mouseenter', function(e) {
                var text = this.getAttribute('data-tooltip');
                if (text) {
                    tooltip.innerHTML = text;
                    tooltip.style.display = 'block';
                    var equipmentLabel = text.split(':')[0];
                    highlightEquipment(equipmentLabel, 'chart');
                }
            });

            area.addEventListener('mousemove', function(e) {
                tooltip.style.left = (e.clientX + 15) + 'px';
                tooltip.style.top = (e.clientY + 15) + 'px';
            });

            area.addEventListener('mouseleave', function() {
                tooltip.style.display = 'none';
                highlightEquipment(null);
                document.querySelectorAll('.equipment-card').forEach(function(card) {
                    card.classList.remove('dimmed-chart', 'dimmed-list', 'highlighted');
                });
            });
        });

        // Gestion de la heatmap
        document.querySelectorAll('.heatmap-cell').forEach(function(cell) {
            cell.addEventListener('mouseenter', function(e) {
                var text = this.getAttribute('data-tooltip');
                if (text) {
                    tooltip.innerHTML = text;
                    tooltip.style.display = 'block';
                    var equipmentLabel = text.split(' (')[0];
                    highlightEquipment(equipmentLabel, 'chart');
                }
            });

            cell.addEventListener('mousemove', function(e) {
                tooltip.style.left = (e.clientX + 15) + 'px';
                tooltip.style.top = (e.clientY + 15) + 'px';
            });

            cell.addEventListener('mouseleave', function() {
                tooltip.style.display = 'none';
                highlightEquipment(null);
                document.querySelectorAll('.equipment-card').forEach(function(card) {
                    card.classList.remove('dimmed-chart', 'dimmed-list', 'highlighted');
                });
            });
        });
    }

    // Attacher les événements de highlight
    function attachHighlightEvents() {
        // Gestion du survol sur la liste des entrées
        document.querySelectorAll('.equipment-card').forEach(function(card) {
            card.addEventListener('mouseenter', function() {
                var equipmentLabel = this.querySelector('.equipment-name').textContent;
                highlightEquipment(equipmentLabel, 'list');
            });

            card.addEventListener('mouseleave', function() {
                // Réinitialiser tous les éléments
                document.querySelectorAll('.chart-segment, .grouped-bar, .pie-slice, .line-path, .line-point, .area-path, .radar-area, .heatmap-cell').forEach(function(el) {
                    el.classList.remove('dimmed', 'highlighted');
                });
                // Pour la liste, remettre opacity normale
                document.querySelectorAll('.equipment-card').forEach(function(c) {
                    c.classList.remove('dimmed-chart', 'dimmed-list', 'highlighted');
                });
            });
        });
    }

    // Gestion des tooltips et highlight sur les segments
    document.querySelectorAll('.chart-segment').forEach(function(segment) {
        segment.addEventListener('mouseenter', function(e) {
            var text = this.getAttribute('data-tooltip');
            if (text) {
                tooltip.innerHTML = text;
                tooltip.style.display = 'block';
                // Extraire le nom de l'entrée
                var equipmentLabel = text.split(':')[0];
                highlightEquipment(equipmentLabel, 'chart');
            }
        });

        segment.addEventListener('mousemove', function(e) {
            tooltip.style.left = (e.clientX + 15) + 'px';
            tooltip.style.top = (e.clientY + 15) + 'px';
        });

        segment.addEventListener('mouseleave', function() {
            tooltip.style.display = 'none';
            highlightEquipment(null);
            document.querySelectorAll('.equipment-card').forEach(function(card) {
                card.classList.remove('dimmed-chart', 'dimmed-list', 'highlighted');
            });
        });
    });

    // Gestion des barres groupées
    document.querySelectorAll('.grouped-bar').forEach(function(bar) {
        bar.addEventListener('mouseenter', function(e) {
            var text = this.getAttribute('data-tooltip');
            if (text) {
                tooltip.innerHTML = text;
                tooltip.style.display = 'block';
                var equipmentLabel = text.split(':')[0];
                highlightEquipment(equipmentLabel, 'chart');
            }
        });

        bar.addEventListener('mousemove', function(e) {
            tooltip.style.left = (e.clientX + 15) + 'px';
            tooltip.style.top = (e.clientY + 15) + 'px';
        });

        bar.addEventListener('mouseleave', function() {
            tooltip.style.display = 'none';
            highlightEquipment(null);
            document.querySelectorAll('.equipment-card').forEach(function(card) {
                card.classList.remove('dimmed-chart', 'dimmed-list', 'highlighted');
            });
        });
    });

    // Gestion du camembert - tranches
    document.querySelectorAll('.pie-slice').forEach(function(slice) {
        slice.addEventListener('mouseenter', function(e) {
            var text = this.getAttribute('data-tooltip');
            var equipmentLabel = this.getAttribute('data-label');
            if (text) {
                tooltip.innerHTML = text;
                tooltip.style.display = 'block';
                highlightEquipment(equipmentLabel, 'chart');
            }
        });

        slice.addEventListener('mousemove', function(e) {
            tooltip.style.left = (e.clientX + 15) + 'px';
            tooltip.style.top = (e.clientY + 15) + 'px';
        });

        slice.addEventListener('mouseleave', function() {
            tooltip.style.display = 'none';
            highlightEquipment(null);
            document.querySelectorAll('.equipment-card').forEach(function(card) {
                card.classList.remove('dimmed-chart', 'dimmed-list', 'highlighted');
            });
        });
    });

    // Gestion des lignes
    document.querySelectorAll('.line-point').forEach(function(point) {
        point.addEventListener('mouseenter', function(e) {
            var text = this.getAttribute('data-tooltip');
            if (text) {
                tooltip.innerHTML = text;
                tooltip.style.display = 'block';
                var equipmentLabel = text.split(' (')[0];
                highlightEquipment(equipmentLabel, 'chart');
            }
        });

        point.addEventListener('mousemove', function(e) {
            tooltip.style.left = (e.clientX + 15) + 'px';
            tooltip.style.top = (e.clientY + 15) + 'px';
        });

        point.addEventListener('mouseleave', function() {
            tooltip.style.display = 'none';
            highlightEquipment(null);
            document.querySelectorAll('.equipment-card').forEach(function(card) {
                card.classList.remove('dimmed-chart', 'dimmed-list', 'highlighted');
            });
        });
    });

    // Gestion des lignes (chemins)
    document.querySelectorAll('.line-path').forEach(function(path) {
        path.addEventListener('mouseenter', function(e) {
            var text = this.getAttribute('data-tooltip');
            if (text) {
                tooltip.innerHTML = text;
                tooltip.style.display = 'block';
                var equipmentLabel = text;
                highlightEquipment(equipmentLabel, 'chart');
            }
        });

        path.addEventListener('mousemove', function(e) {
            tooltip.style.left = (e.clientX + 15) + 'px';
            tooltip.style.top = (e.clientY + 15) + 'px';
        });

        path.addEventListener('mouseleave', function() {
            tooltip.style.display = 'none';
            highlightEquipment(null);
            document.querySelectorAll('.equipment-card').forEach(function(card) {
                card.classList.remove('dimmed-chart', 'dimmed-list', 'highlighted');
            });
        });
    });

    // Gestion du survol sur la liste des entrées
    document.querySelectorAll('.equipment-card').forEach(function(card) {
        card.addEventListener('mouseenter', function() {
            var equipmentLabel = this.querySelector('.equipment-name').textContent;
            highlightEquipment(equipmentLabel, 'list');
        });

        card.addEventListener('mouseleave', function() {
            // Réinitialiser tous les éléments
            document.querySelectorAll('.chart-segment, .grouped-bar, .pie-slice, .line-path, .line-point').forEach(function(el) {
                el.classList.remove('dimmed', 'highlighted');
            });
            // Pour la liste, remettre opacity normale
            document.querySelectorAll('.equipment-card').forEach(function(c) {
                c.classList.remove('dimmed-chart', 'dimmed-list', 'highlighted');
            });
        });
    });

    // Gestionnaire de tri
    document.getElementById('sortSelect').addEventListener('change', function() {
        var sortType = this.value;
        var dateStart = document.getElementById('chartDateStart').value;
        var dateEnd = document.getElementById('chartDateEnd').value;
        var days = calculateDaysBetween(dateStart, dateEnd);
        var chartType = document.getElementById('chartTypeSelect').value;

        jeeDialog.dialog({
            id: 'jee_modal',
            title: '{{Graphiques de consommation}}',
            contentUrl: 'index.php?v=d&plugin=iotawatt&modal=chart&days=' + days + '&type=' + chartType + '&sort=' + sortType,
            width: 1200,
            height: 800
        });
    });

    // Fonction utilitaire pour calculer le nombre de jours entre deux dates
    function calculateDaysBetween(dateStartStr, dateEndStr) {
        var parts1 = dateStartStr.split('/');
        var parts2 = dateEndStr.split('/');
        var date1 = new Date(parts1[2], parts1[1] - 1, parts1[0]);
        var date2 = new Date(parts2[2], parts2[1] - 1, parts2[0]);
        var diffTime = Math.abs(date2 - date1);
        var diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        return diffDays;
    }

    // Initialiser Flatpickr pour les champs de date
    if (typeof flatpickr !== 'undefined') {
        flatpickr('#chartDateStart', {
            dateFormat: 'd/m/Y',
            locale: 'fr',
            maxDate: 'today',
            onChange: function(selectedDates, dateStr) {
                var dateEnd = document.getElementById('chartDateEnd').value;
                if (dateEnd) {
                    reloadChart();
                }
            }
        });
        
        flatpickr('#chartDateEnd', {
            dateFormat: 'd/m/Y',
            locale: 'fr',
            maxDate: 'today',
            onChange: function(selectedDates, dateStr) {
                var dateStart = document.getElementById('chartDateStart').value;
                if (dateStart) {
                    reloadChart();
                }
            }
        });
    }

    // Fonction pour recharger le graphique
    function reloadChart() {
        var dateStart = document.getElementById('chartDateStart').value;
        var dateEnd = document.getElementById('chartDateEnd').value;
        var days = calculateDaysBetween(dateStart, dateEnd);
        var chartType = document.getElementById('chartTypeSelect').value;
        var sortType = document.getElementById('sortSelect').value;

        jeeDialog.dialog({
            id: 'jee_modal',
            title: '{{Graphiques de consommation}}',
            contentUrl: 'index.php?v=d&plugin=iotawatt&modal=chart&days=' + days + '&type=' + chartType + '&sort=' + sortType,
            width: 1200,
            height: 800
        });
    }

    // Gestionnaire de changement de type de graphique
    document.getElementById('chartTypeSelect').addEventListener('change', function() {
        var selectedType = this.value;
        var chartTitle = document.getElementById('chartTitle');

        // Générer le nouveau graphique
        renderChart(selectedType);

        // Mettre à jour le titre
        var titles = {
            'stacked': '<i class="fas fa-chart-bar"></i> {{Graphique empilé}} - {{Consommations quotidiennes}}',
            'pie': '<i class="fas fa-chart-pie"></i> {{Camembert total}} - {{Total période}}',
            'pie-daily': '<i class="fas fa-chart-pie"></i> {{Camembert journalier}} - {{Par jour}}',
            'grouped': '<i class="fas fa-chart-bar"></i> {{Barres groupées}} - {{Comparaison par entrée}}',
            'line': '<i class="fas fa-chart-line"></i> {{Graphique lignes}} - {{Évolution dans le temps}}',
            'area': '<i class="fas fa-chart-area"></i> {{Aires empilées}} - {{Évolution cumulée}}',
            'heatmap': '<i class="fas fa-th"></i> {{Carte thermique}} - {{Matrice de consommation}}'
        };
        if (titles[selectedType] && chartTitle) {
            chartTitle.innerHTML = titles[selectedType];
        }
    });
    
    // Gestionnaire de rafraîchissement
    document.getElementById('refreshChart').addEventListener('click', function() {
        reloadChart();
    });

    // Gestionnaire pour afficher l'historique de chaque entrée
    document.querySelectorAll('.view-history').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();

            var cmdId = this.closest('.equipment-card').getAttribute('data-cmd-id');
            if (cmdId) {
                jeeDialog.dialog({
                    id: 'jee_modal2',
                    title: '{{Historique}}',
                    contentUrl: 'index.php?v=d&modal=cmd.history&id=' + cmdId,
                    width: 1000,
                    height: 600
                });
            }
        });
    });

    // Initialiser l'affichage au chargement
    (function() {
        var selectedType = window.chartType || {};
        var selectedChart = document.querySelector('.chart-type[data-type="' + selectedType + '"]');
        if (selectedChart) {
            if (selectedType === 'stacked') {
                selectedChart.style.display = 'flex';
            } else {
                selectedChart.style.display = 'block';
            }
        }

        // Mettre à jour le titre
        var titles = {
            'stacked': '<i class="fas fa-chart-bar"></i> {{Graphique empilé}} - {{Consommations quotidiennes}}',
            'stacked-total': '<i class="fas fa-chart-bar"></i> {{Graphique empilé total}} - {{Total période}}',
            'pie': '<i class="fas fa-chart-pie"></i> {{Camembert total}} - {{Total période}}',
            'pie-daily': '<i class="fas fa-chart-pie"></i> {{Camembert journalier}} - {{Par jour}}',
            'grouped': '<i class="fas fa-chart-bar"></i> {{Barres groupées}} - {{Comparaison par entrée}}',
            'grouped-total': '<i class="fas fa-chart-bar"></i> {{Barres groupées total}} - {{Total période}}',
            'line': '<i class="fas fa-chart-line"></i> {{Graphique lignes}} - {{Évolution dans le temps}}',
            'area': '<i class="fas fa-chart-area"></i> {{Aires empilées}} - {{Évolution cumulée}}',
            'heatmap': '<i class="fas fa-th"></i> {{Carte thermique}} - {{Matrice de consommation}}'
        };
        if (titles[selectedType]) {
            var chartTitle = document.getElementById('chartTitle');
            if (chartTitle) {
                chartTitle.innerHTML = titles[selectedType];
            }
        }
    });

    // Gestionnaire de bascule €/kWh (Toggle Switch)
    var toggleContainer = document.getElementById('toggleValueType');
    if (toggleContainer) {
        var checkbox = toggleContainer.querySelector('input[type="checkbox"]');
        if (checkbox) {
            checkbox.addEventListener('change', function() {
                // Récupérer le type de graphique actuel sauvegardé
                var currentChartType = window.currentChartType || 'stacked';
                // Regénérer le graphique avec le nouvel état
                renderChart(currentChartType);
            });
        }
    }

    // Initialiser l'affichage au chargement
    (function() {
        var selectedType = window.chartType || 'stacked';
        renderChart(selectedType);
    })();
})();